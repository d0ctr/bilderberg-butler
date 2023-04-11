const { Bot, InlineKeyboard } = require('grammy');
const logger = require('../logger').child({ module: 'telegram-channel-subscriber' });
const { getHealth } = require('../services/health');
const { getRedis } = require('../services/redis');

const discord_notification_map = {};
/**
 * @property {Bot}
 */
const bot = process.env.TELEGRAM_TOKEN ? new Bot(process.env.TELEGRAM_TOKEN) : null;

async function restoreMessageID(chat_id) {
    if (getHealth('redis') !== 'ready') {
        return null;
    }

    const redis = getRedis();

    let current_message_id = await redis.get(`telegram:${chat_id}:channel_subscriber:message_id`);

    current_message_id = Number(current_message_id);

    if (isNaN(current_message_id) || !current_message_id) {
        return null;
    }

    return current_message_id;
}

class DiscordNotification {
    constructor(notification_data, chat_id) {
        this.current_notification_data = null;
        this.chat_id = chat_id;
        this.channel_id = notification_data.channel_id;
        this.channel_name = notification_data.channel_name;
        this.guild_id = notification_data.guild_id;
        this.guild_name = notification_data.guild_name;

        this.cooldown = false;
        this.cooldown_duration = 5 * 1000;

        this._current_message_id = null;
        this.pending_notification_data = null;

        this.pending_notification_data_timer = null;
        this.cooldown_timer = null;
    }

    get current_message_id() {
        return this._current_message_id;
    }

    set current_message_id(value) {
        this._current_message_id = value;

        if (getHealth('redis') === 'ready') {
            const redis = getRedis();
            if (!value) {
                redis.del(`telegram:${this.chat_id}:channel_subscriber:message_id`);
            }
            else {
                redis.set(`telegram:${this.chat_id}:channel_subscriber:message_id`, value);
            }
        }
    }

    get channel_url() {
        return this.current_notification_data?.channel_url;
    }

    get members() {
        return this.current_notification_data?.members;
    }

    isNotified() {
        return (this.current_message_id && true) || false;
    }

    isCooldownActive() {
        return this.cooldown;
    }

    startCooldownTimer() {
        this.cooldown = true;
        this.cooldown_timer = setTimeout(() => {
            this.cooldown_timer = null;
            this.cooldown = false;
        }, this.cooldown_duration);
    }

    update(notification_data) {
        if (!notification_data) {
            return;
        }
        clearTimeout(this.cooldown_timer);

        this.current_notification_data = notification_data;

        this.startCooldownTimer();
    }

    clear() {
        clearTimeout(this.pending_notification_data_timer);
        clearTimeout(this.cooldown_timer);

        this.pending_notification_data_timer = null;
        this.current_notification_data = null;
        this.cooldown_timer = null;
        this.cooldown = false;

        const current_message_id = `${this.current_message_id}`;

        this.current_message_id = null;

        return current_message_id;
    }

    getChannelUrl(notification_data) {
        if(!notification_data) {
            return null;
        }
        if (process.env.DOMAIN) {
            return `${process.env.DOMAIN}/discordredirect/${notification_data.channel_url.replace(/.*discord.com\//, '')}`;
        }
        else {
            return notification_data.channel_url;
        }
    }

    generateNotificationTextFrom(notification_data) {
        if (!notification_data) {
            return null;
        }
        let text = `Канал <a href="${this.getChannelUrl(notification_data)}">${notification_data.channel_name}</a> в Discord:`;

        notification_data.members.forEach((member) => {
            text += `\n${member.member_name || member.user_name} \
${member.muted && '🔇' || ''}\
${member.deafened && '🔕' || ''}\
${member.streaming && '🖥️' || ''}\
${member.camera && '🎥' || ''}`;
        });

        return text;
    }

    getNotificationText() {
        return this.generateNotificationTextFrom(this.current_notification_data);
    }

    getPendingNotificationText() {
        return this.generateNotificationTextFrom(this.pending_notification_data);
    }

    getNotificationKeyboard() {
        return new InlineKeyboard().url(
            'Присоединиться',
            this.getChannelUrl(this.current_notification_data)
        );
    }

    suspendNotification(notification_data, callback) {
        clearTimeout(this.pending_notification_data_timer);
        clearTimeout(this.cooldown_timer);

        this.pending_notification_data = notification_data;
        this.pending_notification_data_timer = setTimeout(() => {
            this.update(this.pending_notification_data);
            callback(this);
            this.pending_notification_data = null;
            this.pending_notification_timer = null;
        }, this.cooldown_duration);

        this.startCooldownTimer();
    }

    dropPendingNotification() {
        clearTimeout(this.pending_notification_data_timer);

        this.pending_notification_data = null;
        this.pending_notification_timer = null;
    }

    getLogMeta() {
        let meta = {};

        meta['discord_channel'] = this.channel_name;
        meta['discord_channel_id'] = this.channel_id;
        meta['discord_guild'] = this.guild_name;
        meta['discord_guild_id'] = this.guild_id;
        meta['telegram_chat_id'] = this.chat_id;


        if (this.isNotified()) {
            meta['notification_data'] = this.current_notification_data;
            meta['pending_notification_data'] = this.pending_notification_data;
            meta['telegram_message_id'] = this.current_message_id;
            meta['telegram_message'] = this.getNotificationText();
        }

        return meta;
    }
}

/**
 * 
 * @param {DiscordNotification} discord_notification 
 * @returns {Promise<Message>}
 */
function pinNotificationMessage(discord_notification) {
    return bot.api.pinChatMessage(
        discord_notification.chat_id,
        discord_notification.current_message_id,
        {
            disable_notification: true,
        }
    ).then(() => {
        logger.debug(
            `Pinned [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]`,
            { ...discord_notification.getLogMeta() }
        );
    }).catch((err) => {
        logger.error(
            `Error while pinning [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]`,
            { error: err.stack || err, ...discord_notification.getLogMeta() }
        );
    });
}

/**
 * 
 * @param {Object || DiscordNotification} notification_data 
 * @param {String} chat_id 
 * @returns {DiscordNotification}
 */
function getDiscordNotification(notification_data, chat_id) {
    if (notification_data instanceof DiscordNotification) {
        return notification_data;
    }

    if (!discord_notification_map[`${chat_id}:${notification_data.channel_id}`]) {
        discord_notification_map[`${chat_id}:${notification_data.channel_id}`] = new DiscordNotification(notification_data, chat_id);
        return discord_notification_map[`${chat_id}:${notification_data.channel_id}`];
    }

    return discord_notification_map[`${chat_id}:${notification_data.channel_id}`];
}

/**
 * 
 * @param {DiscordNotification} discord_notification 
 * @returns 
 */
function clearNotification(discord_notification) {
    if (!discord_notification.isNotified()) {
        logger.debug(
            `No notification to clear about [channel:${discord_notification.channel_id}] in [chat:${discord_notification.chat_id}]`,
            { ...discord_notification.getLogMeta() }
        );
        return;
    }

    const current_message_id = discord_notification.clear();

    return bot.api.deleteMessage(
        discord_notification.chat_id,
        current_message_id
    ).then(() => {
        logger.debug(
            `Deleted notification [message: ${current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]`,
            { ...discord_notification.getLogMeta(), telegram_message_id: current_message_id }
        );
    }).catch(err => {
        logger.error(
            `Error while clearing notification [message: ${current_message_id}] about [channel_id: ${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]`,
            { error: err.stack || err, ...discord_notification.getLogMeta(), telegram_message_id: current_message_id }
        );
    });
}

/**
 * 
 * @param {DiscordNotification} discord_notification 
 * @returns {Promise<Message>}
 */
function sendNotificationMessage(discord_notification) {
    return bot.api.sendMessage(
        discord_notification.chat_id,
        discord_notification.getNotificationText(),
        {
            disable_web_page_preview: true,
            parse_mode: 'HTML',
            reply_markup: discord_notification.getNotificationKeyboard()
        }
    ).then((message) => {
        discord_notification.current_message_id = message.message_id;
        logger.debug(
            `Sent notification about [channel:${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}], got [message: ${message.message_id}]`,
            { ...discord_notification.getLogMeta() }
        );
        pinNotificationMessage(discord_notification);
    }).catch((err) => {
        logger.error(
            `Error while sending notification about [channel: ${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}]`,
            { error: err.stack || err, ...discord_notification.getLogMeta() }
        );
    });
}

/**
 * 
 * @param {DiscordNotification} discord_notification 
 * @returns {Promise<Message>}
 */
function editNotificationMessage(discord_notification) {
    return bot.api.editMessageText(
        discord_notification.chat_id,
        discord_notification.current_message_id,
        discord_notification.getNotificationText(),
        {
            disable_web_page_preview: true,
            parse_mode: 'HTML',
            reply_markup: discord_notification.getNotificationKeyboard()
        }
    ).then((message) => {
        discord_notification.current_message_id = message.message_id;
        logger.debug(
            `Edited [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]`,
            { ...discord_notification.getLogMeta() }
        );
    }).catch((err) => {
        logger.error(
            `Error while editing [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]`, 
            { error: err.stack || err, ...discord_notification.getLogMeta() }
        );
        if (err.description.search('message to edit not found') !== -1) {
            logger.info(`[message: ${discord_notification.current_message_id}] doesn't exist, sending new message instead`);
            discord_notification.current_message_id = null;
            return sendNotificationMessage(discord_notification);
        }
    });
}

async function wrapInCooldown(notification_data, chat_id) {
    const discord_notification = getDiscordNotification(notification_data, chat_id);

    if (discord_notification.isNotified()) {
        if (discord_notification.generateNotificationTextFrom(notification_data) == discord_notification.getNotificationText()) {
            logger.debug(
                `Skipping notification about [channel: ${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}] as equals to current`,
                { ...discord_notification.getLogMeta() }
            );
            discord_notification.dropPendingNotification();
            return;
        }

        if (discord_notification.isCooldownActive()) {
            logger.debug(
                `Suspending notification about [channel: ${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}]`,
                { ...discord_notification.getLogMeta() }
            );
            discord_notification.suspendNotification(notification_data, editNotificationMessage);
            return;
        }
    }
    else {
        discord_notification.current_message_id = await restoreMessageID(chat_id);
    }
    
    
    discord_notification.update(notification_data);

    if (discord_notification.isNotified()) {
        return editNotificationMessage(discord_notification);
    }
    else {
        return sendNotificationMessage(discord_notification);
    }
}

async function sendNotification(notification_data, chat_id) {
    if (!notification_data || !chat_id || !bot) return;

    if (!notification_data.members.length) {
        clearNotification(getDiscordNotification(notification_data, chat_id));
        return;
    }

    await wrapInCooldown(notification_data, chat_id);
}

async function deleteNotification(chat_id, channel_id) {
    if (!chat_id || !channel_id || !bot) return;

    if (discord_notification_map[`${chat_id}:${notification_data.channel_id}`]) {
        clearNotification(discord_notification_map[`${chat_id}:${notification_data.channel_id}`]);
    }
}
module.exports = {
    sendNotification,
    deleteNotification
}