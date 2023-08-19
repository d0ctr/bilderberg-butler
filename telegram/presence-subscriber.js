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

class PresenceNotification {
    constructor(chat_id, presence_data) {
        this.chat_id = chat_id;
        this.guild_id = presence_data.guild_id;
        this.guild_name = presence_data.guild_name;
        this.presence_collection = new Map();
        this.current_update_promise = null;
        this.is_deleted = false;
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
        meta['telegram_user_ids'] = Object.keys(this.presence_collection).join(',');

        return meta;
    }

    getNotificationText() {
        let text = 'Активность';
        for (const [{}, { member_name, activity, call_me_by = null }] of this.presence_collection.entries()) {
            if (activity) text += `\n${call_me_by || member_name} — ${activity}`;
        }
        return text;
    }

    isDeleted() {
        return this.is_deleted;
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

async function editDescription(presence_notification, new_description) {
    if (!presence_notification) return;

    presence_notification.current_update_promise = bot.api.setChatDescription(
        presence_notification.chat_id,
        new_description
    ).then(() => {
        logger.debug(
            `Updated description in [chat: ${presence_notification.chat_id}] with new description: ${new_description}`,
            { ...presence_notification.getLogMeta() }
        )
    }).catch(err => {
        logger.error(
            `Error while updating description in [chat: ${presence_notification.chat_id}]`,
            { error: err.stack || err, ...presence_notification.getLogMeta() }
        )
    });
    return presence_notification.current_update_promise;
}

async function updatePresence(telegram_chat_id, telegram_user_id, presence_data) {
    if (!bot) {
        return;
    }

    const presence_notification = getPresenceNotification(presence_data, telegram_chat_id);

    try {
        const chat_member = await bot.api.getChatMember(telegram_chat_id, telegram_user_id);

        if (chat_member?.user?.username) {
            presence_notification.setPresence(telegram_user_id, { call_me_by: `@${chat_member.user.username}`, ...presence_data });
        }
        else {
            presence_notification.setPresence(telegram_user_id, { call_me_by: `${chat_member.user.first_name}`, ...presence_data });
        }
    }
    catch (err) {
        logger.warn(
            `Failed to fetch [user: ${telegram_user_id}] in [chat: ${telegram_chat_id}], failing back to Discord member's display name`,
            { error: err.stack || err, ...presence_notification.getLogMeta() }
        );
        presence_notification.setPresence(telegram_user_id, presence_data);
    }

    let chat_data;
    try {
        chat_data = await bot.api.getChat(telegram_chat_id);
    }
    catch (err) {
        logger.error(
            `Error while fetching [chat: ${telegram_chat_id}], skipping update`,
            { error: err.stack || err, ...presence_notification.getLogMeta() }
        );
        return;
    }

    const { description } = chat_data;
    let new_description = '';
    if (description?.length) {
        if (description.match(/\n\-\-[$\n]?/gm)?.length) {
            new_description = `${description.match(/.*\n--[\n$]?/gm)[0]}\n`;
        }
    }

    if (presence_notification.isEmpty()) {
        return editDescription(presence_notification, new_description);
    }

    new_description += presence_notification.getNotificationText();

    if (presence_notification.current_update_promise !== null) {
        return presence_notification.current_update_promise.then(() => {
            logger.debug(
                `Scheduling presence notification update to [chat: ${presence_notification.chat_id}]`,
                { ...presence_notification.getLogMeta() }
            );
            editDescription(presence_notification, new_description);
        });
    }
    return editDescription(presence_notification, new_description);
}

async function deletePresence(telegram_chat_id) {
    if (!telegram_chat_id || !bot) return;

    if (!presence_notification_map[telegram_chat_id]) return;

    if (presence_notification_map[telegram_chat_id]?.isDeleted()) return;

    let chat_data;
    try {
        chat_data = await bot.api.getChat(telegram_chat_id);
    }
    catch (err) {
        logger.error(
            `Error while fetching [chat: ${telegram_chat_id}], skipping update`,
            { error: err.stack || err, telegram_chat_id }
        );
        return;
    }

    const { description } = chat_data;
    let new_description = '';
    if (description?.length) {
        if (description.match(/\n\-\-[$\n]?/gm)?.length) {
            new_description = `${description.match(/.*\n--[\n$]?/gm)[0]}\n`;
        }
    }

    return editDescription(presence_notification_map[telegram_chat_id], new_description).then(() => {
        presence_notification_map[telegram_chat_id].is_deleted = true;
        logger.silly(
            `Marking presence as deleted for [chat: ${telegram_chat_id}]`,
            { ...presence_notification_map[telegram_chat_id].getLogMeta() }
        );
    });
}

async function testPermissions(telegram_chat_id) {
    let isPermitted = false;

    try {
        await bot.init();
    }
    catch (err) {
        logger.error(
            `Could not init bot (fetch bot info)`,
            { error: err.stack || err }
        );
        throw err;
    }

    let chat_member;
    try {
        chat_member = await bot.api.getChatMember(telegram_chat_id, bot.botInfo.id);
    }
    catch (err) {
        logger.error(
            `Error while fetching bot's member object for [chat: ${telegram_chat_id}]`,
            { error: err.stack || err }
        );
        return false;
    }

    if (chat_member?.can_change_info) {
        isPermitted = true;
    }

    return isPermitted;
}

module.exports = {
    updatePresence,
    deletePresence,
    testPermissions
};
