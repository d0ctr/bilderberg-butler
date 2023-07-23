const { Bot } = require('grammy');
const logger = require('../logger').child({ module: 'telegram-presence-subscriber' });
const { getHealth } = require('../services/health');
const { getRedis } = require('../services/redis');

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

const presence_notification_map = {};

async function restoreMessageID(chat_id) {
    if (getHealth('redis') !== 'ready') return null;
    return getRedis().get(`telegram:${chat_id}:presence_subscriber:message`);
}
class PresenceNotification {
    constructor(chat_id, presence_data) {
        this.chat_id = chat_id;
        this.guild_id = presence_data.guild_id;
        this.guild_name = presence_data.guild_name;
        this.presence_collection = new Map();
        this.current_update_promise = null;
        this.last_notification_text = null;
    }

    get current_message_id() {
        return this._current_message_id;
    }

    set current_message_id(value) {
        if (getHealth('redis') === 'ready') {
            const redis = getRedis();
            if (value) {
                redis.set(`telegram:${this.chat_id}:presence_subscriber:message`, value);
            }
            else {
                redis.del(`telegram:${this.chat_id}:presence_subscriber:message`);
            }
        }

        this._current_message_id = value;
    }

    isNotified() {
        return !!this.current_message_id;
    }

    isEmpty() {
        for (const [{}, presence_data] of this.presence_collection.entries()) {
            if (presence_data.activity) {
                return false;
            }
        }
        return true;
    }

    setPresence(telegram_user_id, presence_data) {
        this.presence_collection.set(telegram_user_id, presence_data);
    }

    getLogMeta() {
        let meta = {};

        meta['discord_guild'] = this.guild_name;
        meta['discord_guild_id'] = this.guild_id;
        meta['telegram_chat_id'] = this.chat_id;
        meta['telegram_user_ids'] = this.presence_collection.keys().join(',');

        if (this.isNotified()) {
            meta['telegram_message_id'] = this.current_message_id;
        }

        return meta;
    }

    getNotificationText() {
        let text = '<b>Активность</b>';
        for (const [{}, { member_name, activity }] of this.presence_collection.entries()) {
            text += `\n${member_name} – <i>${activity}</i>`;
        }
        return text;
    }

    isChanged() {
        return this.last_notification_text !== this.getNotificationText();
    }
}

/**
 * 
 * @param {*} presence_data 
 * @param {*} chat_id 
 * @returns {PresenceNotification}
 */
function getPresenceNotification(presence_data, chat_id) {
    if (presence_data instanceof PresenceNotification) {
        return presence_data;
    }

    if (!presence_notification_map[chat_id]) {
        presence_notification_map[chat_id] = new PresenceNotification(chat_id, presence_data);
    }

    return presence_notification_map[chat_id];
}

async function deleteMessage(presence_notification) {
    if (!presence_notification?.isNotified()) {
        logger.warn(
            `No presence notification to clear about [chat: ${presence_notification.chat_id}]`,
            { ...presence_notification.getLogMeta() }
        );
        return;
    }

    return bot.api.deleteMessage(
        presence_notification.chat_id,
        presence_notification.current_message_id
    ).then(() => {
        logger.debug(
            `Deleted presence notification [message: ${presence_notification.current_message_id}]  in [chat: ${presence_notification.chat_id}]`,
            { ...presence_notification.getLogMeta() }
        );
        presence_notification.current_message_id = null;
    });
}

async function pinMessage(presence_notification) {
    return bot.api.pinChatMessage(
        presence_notification.chat_id,
        presence_notification.current_message_id,
        {
            disable_notification: true,
        }
    ).then(() => {
        logger.debug(
            `Pinned [message: ${presence_notification.current_message_id}] in [chat: ${presence_notification.chat_id}]`,
            { ...presence_notification.getLogMeta() }
        );
    }).catch((err) => {
        logger.error(
            `Error while pinning [message: ${presence_notification.current_message_id}] in [chat: ${presence_notification.chat_id}]`,
            { error: err.stack || err, ...presence_notification.getLogMeta() }
        );
    });
}

async function sendMessage(presence_notification) {
    if (!presence_notification || !bot) return;

    presence_notification.current_update_promise = bot.api.sendMessage(
        presence_notification.chat_id,
        presence_notification.getNotificationText(),
        {
            disable_web_page_preview: true,
            parse_mode: 'HTML'
        }
    ).then(({message_id}) => {
        presence_notification.current_message_id = message_id;
        presence_notification.last_notification_text = presence_notification.getNotificationText();
        logger.debug(
            `Sent presence notification to [chat: ${presence_notification.chat_id}], got [message: ${message_id}]`,
            { ...presence_notification.getLogMeta() }
        );
        pinMessage(presence_notification);
    }).catch((err) => {
        logger.error(
            `Error while sending presence notification to [chat: ${presence_notification.chat_id}]`,
            { error: err.stack || err, ...presence_notification.getLogMeta() }
        );
    });
    return presence_notification.current_update_promise;
}

async function editMessage(presence_notification) {
    if (!presence_notification) return;

    presence_notification.current_update_promise = bot.api.editMessageText(
        presence_notification.chat_id,
        presence_notification.current_message_id,
        presence_notification.getNotificationText(),
        {
            disable_web_page_preview: true,
            parse_mode: 'HTML'
        }
    ).then(() => {
        presence_notification.last_notification_text = presence_notification.getNotificationText();
        logger.debug(
            `Edited [message: ${presence_notification.current_message_id}]  in [chat: ${presence_notification.chat_id}]`,
            { ...presence_notification.getLogMeta() }
        );
    }).catch(err => {
        logger.error(
            `Error while editing [message: ${presence_notification.current_message_id}] in [chat: ${presence_notification.chat_id}]`, 
            { error: err.stack || err, ...presence_notification.getLogMeta() }
        );
        if (err.description.search('message to edit not found') !== -1) {
            logger.debug(`[message: ${presence_notification.current_message_id}] doesn't exist, sending new message instead`);
            presence_notification.current_message_id = null;
            return sendMessage(presence_notification);
        }
    });

    return presence_notification.current_update_promise;
}

async function updatePresence(telegram_chat_id, telegram_user_id, presence_data) {
    if (!bot) {
        return;
    }

    const presence_notification = getPresenceNotification(presence_data, telegram_chat_id);
    presence_notification.setPresence(telegram_user_id, presence_data);

    if (!presence_notification.isNotified()) {
        const restored_message_id = await restoreMessageID(telegram_chat_id);
        if (restored_message_id != null) {
            presence_notification.current_message_id = Number(restored_message_id);
        }
    }

    if (presence_notification.isEmpty()) {
        deleteMessage(presence_notification);
    }

    if (presence_notification.isNotified()) {
        if (presence_notification.isUpdated()) {
            logger.debug(
                `Skip presence notification to [chat: ${presence_notification.chat_id}] as equals to current`,
                { ...presence_notification.getLogMeta() }
            );
        }
        if (presence_notification.current_update_promise !== null) {
            return presence_notification.current_update_promise.then(() => {
                logger.debug(
                    `Scheduling presence notification update to [chat: ${presence_notification.chat_id}]`,
                    { ...presence_notification.getLogMeta() }
                );
                editMessage(presence_notification);
            });
        }
        return editMessage(presence_notification);
    }

    return sendMessage(presence_notification);
}

function isNotificationMessage(chat_id, message_id) {
    if (!chat_id || !message_id) return false;
    return presence_notification_map[chat_id]?.current_message_id === message_id;
}

async function deleteNotification(chat_id) {
    if (!chat_id || !bot) return;

    if (!presence_notification_map[chat_id]) return;
    
    deleteMessage(presence_notification_map[chat_id]);
    delete presence_notification_map[chat_id];
}

module.exports = {
    updatePresence,
    isNotificationMessage,
    deleteNotification
};