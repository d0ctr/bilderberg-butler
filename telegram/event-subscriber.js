const { Bot, InlineKeyboard } = require('grammy');
const logger = require('../logger').child({ module: 'telegram-channel-subscriber' });
const { getHealth } = require('../services/health');
const { getRedis } = require('../services/redis');

const discord_event_map = {};

const chat_event_map = {};

const bot_config = {};
if (process.env?.ENV === 'dev') {
    bot_config.client = {
        buildUrl: ({}, token, method) => `https://api.telegram.org/bot${token}/test/${method}`
    }
}

/**
 * @property {Bot?}
 */
const bot = process.env.TELEGRAM_TOKEN ? new Bot(process.env.TELEGRAM_TOKEN, bot_config) : null;

class DiscordEvent {
    constructor(event_data, chat_id) {
        this.current_event_data = null;
        this.chat_id = chat_id;
        this.event_id = event_data.event_id;
        this.event_name = event_data.event_name;
        this.guild_id = event_data.guild_id;
        this.guild_name = event_data.guild_name;
        this.current_update_promise = null;
    }

    get current_message_id() {
        return this._current_message_id;
    }

    set current_message_id(value) {
        if (!chat_event_map[this.chat_id]) {
            chat_event_map[this.chat_id] = new Set();
        }

        if (value === null && this._current_message_id !== null) {
            chat_event_map[this.chat_id].delete(this._current_message_id);
        }
        else {
            chat_event_map[this.chat_id].add(value);
        }

        if (getHealth('redis') === 'ready') {
            const redis = getRedis();
            if (value) {
                redis.hset(`telegram:${this.chat_id}:event_subscriber:message_to_event`, { [value]: this.event_id });
            }
            else {
                redis.hdel(`telegram:${this.chat_id}:event_subscriber:message_to_event`, [this._current_message_id]);
            }
        }

        this._current_message_id = value;
    }

    isNotified() {
        return !!this.current_message_id;
    }

    update(event_data) {
        if (!event_data) {
            return;
        }

        this.current_event_data = event_data;
    }

    getRedirectUrl(discord_url) {
        if (!discord_url) {
            return;
        }
        if (process.env.DOMAIN) {
            return `${process.env.DOMAIN}/discordredirect/${discord_url.replace(/.*discord.com\//, '')}`;
        }
        return discord_url;
    }

    generateNotificationTextFrom(event_data) {
        if (!event_data) {
            return null;
        }
        let text = `📅 В Discord начался новый эвент\nНазвание: <a href="${this.getRedirectUrl(event_data.event_url)}">${event_data.event_name}</a>`;

        if (event_data.channel_url) text += `\nКанал: <a href="${this.getRedirectUrl(event_data.channel_url)}">${event_data.channel_name}</a>`;

        if (event_data.event_description) text += `\n${event_data.event_description}`;

        return text;
    }

    getNotificationText(event_data) {
        return event_data ? this.generateNotificationTextFrom(event_data) : this.generateNotificationTextFrom(this.current_event_data);
    }

    generateKeyboardFrom(event_data) {
        return new InlineKeyboard().url(
            'Посетить',
            event_data?.channel_url ? this.getRedirectUrl(event_data.channel_url) : this.getRedirectUrl(event_data.event_url)
        );
    }

    getNotificationKeyboard(event_data) {
        return event_data ? this.generateKeyboardFrom(event_data) : this.generateKeyboardFrom(this.current_event_data);
    }

    getLogMeta() {
        let meta = {};

        meta['discord_event'] = this.event_name;
        meta['discord_event_id'] = this.event_id;
        meta['discord_guild'] = this.guild_name;
        meta['discord_guild_id'] = this.guild_id;
        meta['telegram_chat_id'] = this.chat_id;

        if (this.isNotified()) {
            meta['telegram_message_id'] = this.current_message_id;
        }

        return meta;
    }

    getImage(event_data) {
        return event_data ? event_data?.event_cover_url : this.current_event_data?.event_cover_url;
    }
}

async function restoreMessageID(chat_id, event_id) {
    if (getHealth('redis') !== 'ready') {
        return null;
    }

    const redis = getRedis();

    const message_to_event = await redis.hgetall(`telegram:${chat_id}:event_subscriber:message_to_event`);

    let current_message_id;

    for (const [message_id, event_id_] of Object.entries(message_to_event)) {
        if (event_id_ === event_id) {
            current_message_id = Number(message_id);
            break;
        }
    }

    if (isNaN(current_message_id) || !current_message_id) {
        return null;
    }

    return current_message_id;
}

function getDiscordEvent(event_data, chat_id) {
    if (event_data instanceof DiscordEvent) {
        return event_data;
    }

    if (!discord_event_map[`${chat_id}:${event_data.event_id}`]) {
        discord_event_map[`${chat_id}:${event_data.event_id}`] = new DiscordEvent(event_data, chat_id);
    }

    return discord_event_map[`${chat_id}:${event_data.event_id}`];
}

/**
 * 
 * @param {DiscordEvent} discord_event 
 * @param {*} event_data 
 * @param {'edit' | 'new'} type 
 * @returns {['editMessageText' | 'editMessageCaption' | 'sendMessage' | 'sendPhoto', []]}
 */
function generateAPICall(discord_event, event_data, type = 'new') {
    let method_name = 'sendMessage';
    const args = [discord_event.chat_id];
    const other = {
        disable_web_page_preview: true,
        parse_mode: 'HTML',
        reply_markup: discord_event.getNotificationKeyboard(event_data)
    };

    if (discord_event.getImage()) {
        method_name = type === 'edit' ? 'editMessageCaption' : 'sendPhoto';
        args.push(type === 'edit' ? discord_event.current_message_id : event_data.event_cover_url);
        other.caption = discord_event.getNotificationText(event_data);

    }
    else {
        method_name = type === 'edit' ? 'editMessageText' : 'sendMessage';
        args.push(type === 'edit' ? discord_event.current_message_id : discord_event.getNotificationText(event_data));
        type === 'edit' && args.push(discord_event.getNotificationText(event_data));
    }

    args.push(other);
    return [method_name, args];
} 

async function editMessage(discord_event, new_event_data) {
    if (!discord_event || !new_event_data) return;

    const [method_name, args] = generateAPICall(discord_event, new_event_data, 'edit');

    discord_event.current_update_promise = bot.api[method_name](...args).then(message => {
        discord_event.update(new_event_data);
        logger.debug(
            `Successful call to ${method_name} about [event: ${discord_event.event_id}] to [chat: ${discord_event.chat_id}], got [message: ${message.message_id}]`,
            { ...discord_event.getLogMeta() }
        );
    }).catch(err => {
        logger.error(
            `Error while calling ${method_name} about [event: ${discord_event.event_id}] to [chat: ${discord_event.chat_id}]`, 
            { error: err.stack || err, ...discord_event.getLogMeta() }
        );
        if (err.description.search('message to edit not found') !== -1) {
            logger.debug(`[message: ${discord_event.current_message_id}] doesn't exist, sending new message instead`);
            discord_event.current_message_id = null;
            return sendMessage(discord_event);
        }
    });

    return discord_event.current_update_promise;
}

async function sendMessage(discord_event) {
    if (!discord_event) return;

    const [method_name, args] = generateAPICall(discord_event, discord_event.current_event_data, 'new');

    discord_event.current_update_promise = bot.api[method_name](...args).then(message => {
        discord_event.current_update_promise = null;
        discord_event.current_message_id = message.message_id;
        logger.debug(
            `Successful call to ${method_name} about [event: ${discord_event.event_id}] to [chat: ${discord_event.chat_id}], got [message: ${message.message_id}]`,
            { ...discord_event.getLogMeta() }
        );
    }).catch(err => {
        discord_event.current_update_promise = null;
        logger.error(
            `Error while calling ${method_name} about [event: ${discord_event.event_id}] to [chat: ${discord_event.chat_id}]`, 
            { error: err.stack || err, ...discord_event.getLogMeta() }
        );
        discord_event.current_event_data = null;
    });

    return discord_event.current_update_promise;
}

async function deleteMessage(discord_event) {
    if (!discord_event?.isNotified()) {
        logger.warn(
            `No event notification to clear about [event: ${discord_event.event_id}] to [chat: ${discord_event.chat_id}]`,
            { ...discord_event.getLogMeta() }
        );
        return;
    }

    return bot.api.deleteMessage(
        discord_event.chat_id,
        discord_event.current_message_id
    ).then(() => {
        logger.debug(
            `Deleted event notification [message: ${discord_event.current_message_id}] about [event:${discord_event.event_id}] in [chat: ${discord_event.chat_id}]`,
            { ...discord_event.getLogMeta() }
        );
        discord_event.current_message_id = null;
    });
}

async function sendNotification(event_data, chat_id) {
    if (!event_data || !chat_id || !bot) return;

    const discord_event = getDiscordEvent(event_data, chat_id);

    if (!discord_event.isNotified()) {
        discord_event.current_message_id = await restoreMessageID(chat_id, event_data.event_id);
    }

    if (!event_data.event_active) {
        return deleteMessage(discord_event);
    }

    if (discord_event.isNotified()) {
        if (discord_event.getNotificationText(event_data) === discord_event.getNotificationText()) {
            logger.debug(
                `Skip event notification about [event: ${discord_event.event_id}]  to [chat: ${discord_event.chat_id}] as equals to current`,
                { ...discord_event.getLogMeta() }
            );
        }
        if (discord_event.current_update_promise !== null) {
            return discord_event.current_update_promise.then(() => {
                logger.debug(
                    `Scheduling event notification update about [event: ${discord_event.event_id}]  to [chat: ${discord_event.chat_id}]`,
                    { ...discord_event.getLogMeta() }
                );
                editMessage(discord_event, event_data);
            });
        }
        return editMessage(discord_event, event_data);
    }

    discord_event.update(event_data);
    return sendMessage(discord_event, event_data);
}

async function deleteNotification(chat_id, event_id) {
    if (!chat_id || !event_id || !bot) return;

    if (!discord_event_map[`${chat_id}:${event_id}`]) return;
    
    deleteMessage(discord_event_map[`${chat_id}:${event_id}`]);
    delete discord_event_map[`${chat_id}:${event_id}`];
}

function isNotificationMessage(chat_id, message_id) {
    if (!chat_id || !message_id) return false;
    return chat_event_map[chat_id] && chat_event_map[chat_id].has(message_id);
}

module.exports = {
    sendNotification,
    deleteNotification,
    isNotificationMessage
};