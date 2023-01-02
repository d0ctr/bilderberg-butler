const { Bot, InlineKeyboard } = require('grammy');
const logger = require('../logger').child({ module: 'telegram-channel-subscriber' });

const discord_notification_map = {};

let bot = null;
if (process.env.TELEGRAM_TOKEN) {
    bot = new Bot(process.env.TELEGRAM_TOKEN);
}

class DiscordNotification {
    constructor(notification_data, chat_id) {
        this.current_notification_data = notification_data;
        this.chat_id = chat_id;
        this.channel_id = notification_data.channel_id;
        this.channel_name = notification_data.channel_name;
        this.guild_id = notification_data.guild_id;
        this.guild_name = notification_data.guild_name;

        this.cooldown = false;
        this.cooldown_duration = 5 * 1000;

        this.current_message_id = null;
        this.pending_notification_data = null;

        this.pending_notification_data_timer = null;
        this.cooldown_timer = null;
    }

    get channel_url() {
        return this.current_notification_data.channel_url;
    }

    get members() {
        return this.current_notification_data.members;
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
            this.current_notification_data = null;
            this.cooldown = false;
            this.pending_notification_data = null;

            return this.current_message_id;
        }

        this.current_notification_data = notification_data;

        this.startCooldownTimer();
    }

    clear() {
        clearTimeout(this.pending_notification_data_timer);
        clearTimeout(this.cooldown_timer);

        this.pending_notification_data_timer = null;
        this.cooldown_timer = null;

        const current_message_id = `${this.update()}`;

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
            text += `\n${member.user_name}\t\
${member.muted && '🔇' || ' '}\
${member.deafened && '🔕' || ' '}\
${member.streaming && '🎥' || ' '}`;
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
    let discord_notification = discord_notification_map[`${chat_id}:${notification_data.channel_id}`];
    if (!discord_notification) {
        discord_notification_map[`${chat_id}:${notification_data.channel_id}`] = new DiscordNotification(notification_data, chat_id);
        return discord_notification_map[`${chat_id}:${notification_data.channel_id}`];
    }
    return discord_notification;
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
            `Sent [notification: ${discord_notification.getNotificationText()}] about [channel:${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}], got [message: ${message.message_id}]`,
            { ...discord_notification.getLogMeta() }
        );
        pinNotificationMessage(discord_notification);
    }).catch((err) => {
        logger.error(
            `Error while sending [notification: ${discord_notification.getNotificationText()}] about [channel: ${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}]`,
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
            `Edited [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}] with [notification: ${discord_notification.getNotificationText()}]`,
            { ...discord_notification.getLogMeta() }
        );
    }).catch((err) => {
        logger.error(
            `Error while editing [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}] with [notification: ${discord_notification.getNotificationText()}]`, 
            { error: err.stack || err, ...discord_notification.getLogMeta() }
        );
    });
}

function wrapInCooldown(notification_data, chat_id) {
    const discord_notification = getDiscordNotification(notification_data, chat_id);

    if (discord_notification.isNotified() && discord_notification.isCooldownActive()) {
        logger.debug(
            `Suspending [notification: ${discord_notification.getPendingNotificationText(notification_data)}] about [channel: ${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}]`,
            { ...discord_notification.getLogMeta() }
        );
        discord_notification.suspendNotification(notification_data, editNotificationMessage);
        return;
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

    wrapInCooldown(notification_data, chat_id);
}

module.exports = {
    sendNotification
}