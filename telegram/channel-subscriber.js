const { Bot, InlineKeyboard } = require('grammy');
const logger = require('../logger').child({ module: 'telegram-channel-subscriber' });
const { getHealth } = require('../services/health');
const { getRedis } = require('../services/redis');
const { icons, wideSpace } = require('../utils');

/**
 * Channel Subscriber
 * @namespace ChannelSubscriber
 */

const discord_notification_map = {};

const chat_notification_map = {};

const bot_config = {};
if (process.env?.ENV === 'dev') {
    bot_config.client = {
        buildUrl: (_, token, method) => `https://api.telegram.org/bot${token}/test/${method}`
    }
}
/**
 * @property {Bot?}
 * @memberof ChannelSubscriber
 */
const bot = process.env.TELEGRAM_TOKEN ? new Bot(process.env.TELEGRAM_TOKEN, bot_config) : null;

/**
 * Restores the last used message id for notification in telegram chat from Redis
 * @param {string} chat_id - Telegram chat id
 * @param {string} channel_id - Id of the discord channel that triggered notification
 * @returns {number | null} message id in the telegram chat
 * @memberof ChannelSubscriber
 */
async function restoreMessageID(chat_id, channel_id) {
    if (getHealth('redis') !== 'ready') {
        return null;
    }

    const redis = getRedis();

    const message_to_channel = await redis.hgetall(`telegram:${chat_id}:channel_subscriber:message_to_channel`);

    let current_message_id;

    for (const [message_id, channel_id_] of Object.entries(message_to_channel)) {
        if (channel_id_ === channel_id) {
            current_message_id = Number(message_id);
            break;
        }
    }

    if (isNaN(current_message_id) || !current_message_id) {
        return null;
    }

    return current_message_id;
}

/**
 * @typedef {object} DiscordNotificationData
 * @property {string} channel_id
 * @property {string} channel_name
 * @property {string} channel_url
 * @property { 'voice' | 'text' | 'announcements' | 'forum' | 'stage' | undefined } channel_type
 * @property {string} guild_id
 * @property {string} guild_name
 * @property {object[]} members
 * @property {string} members[].user_id
 * @property {string} members[].user_name
 * @property {boolean} members[].streaming
 * @property {string} members[].member_id
 * @property {string} members[].member_name
 * @property {boolean} members[].muted
 * @property {boolean} members[].deafened
 * @property {boolean} members[].camera
 * @property {string?} members[].activity
 * @memberof ChannelSubscriber
 */

/**
 * Discord Notification
 * @class
 * @memberof ChannelSubscriber
*/
class DiscordNotification {
    /**
     * @param {ChannelSubscriber.DiscordNotificationData} notification_data - Channel state data from discord
     * @param {string} chat_id - Telegram chat id
    */
    constructor(notification_data, chat_id) {
        /**  @member {ChannelSubscriber.DiscordNotificationData?} - The source of the currently (or about to be) posted notification */
        this.current_notification_data = null;
        /** @member {string} - Telegram chat id */
        this.chat_id = chat_id;
        /** @member {string} - Discord channel id  */
        this.channel_id = notification_data.channel_id;
        /**  @member {string} - Discord channel name */
        this.channel_name = notification_data.channel_name;
        /**  @member {string} - Discord server id */
        this.guild_id = notification_data.guild_id;
        /**  @member {string} - Discord name id */
        this.guild_name = notification_data.guild_name;

        /** @member {number} - The time it takes to cooldown from update */
        this.cooldown_duration = 5 * 1000;
        /** @member {NodeJS.Timeout} - Timer controlling the state of the cooldown */
        this.cooldown_timer = null;
        /** @member {number} - The time when the current cooldown will finnish (or has finished) */
        this.cooldown_timeout = 0;

        this._current_message_id = null;

        /** @member {ChannelSubscriber.DiscordNotificationData} - The source for the next notification update that will be applied after the cooldown */
        this.pending_notification_data = null;
        /** @member {NodeJS.Timeout} - Scheduling timer that will update the notification message once it fires */
        this.pending_notification_data_timer = null;
    }

    /**  @member {string} - Telegram message id for the currently posted notification */
    get current_message_id() {
        return this._current_message_id;
    }

    set current_message_id(value) {
        if (!chat_notification_map[this.chat_id]) {
            chat_notification_map[this.chat_id] = new Set();
        }

        if (value !== null && this._current_message_id !== null) {
            chat_notification_map[this.chat_id].delete(this._current_message_id);
        }

        chat_notification_map[this.chat_id].add(value);

        if (getHealth('redis') === 'ready') {
            const redis = getRedis();
            if (value) {
                redis.hset(`telegram:${this.chat_id}:channel_subscriber:message_to_channel`, { [value]: this.channel_id });
            }
            else {
                redis.hdel(`telegram:${this.chat_id}:channel_subscriber:message_to_channel`, [this._current_message_id]);
            }
        }

        this._current_message_id = value;
    }

    /** @member {string} - Current discord channel url */
    get channel_url() {
        return this.current_notification_data?.channel_url;
    }

    /** @member {object[]}  - Array of members of the discord channel  */
    get members() {
        return this.current_notification_data?.members;
    }

    /**
     * Returns `true` if the notification is posted 
     * @returns {boolean}
     */
    isNotified() {
        return !!this.current_message_id;
    }

    /**
     * Returns `true` if the cooldown is active
     * @returns {boolean}
     */
    isCooldownActive() {
        return this.cooldown_timer != null;
    }

    /**
     * Resets {@link cooldown_timer}
     */
    startCooldownTimer() {
        clearTimeout(this.cooldown_timer);
        this.cooldown_timer = setTimeout(() => {
            this.cooldown_timer = null;
            this.cooldown_timeout = 0;
        }, this.cooldown_duration);
        this.cooldown_timeout = Date.now() + this.cooldown_duration;
    }

    /**
     * Sets the new current notification data and resets the cooldown timer
     * @param {ChannelSubscriber.DiscordNotificationData} notification_data - New notification data
     */
    update(notification_data) {
        if (!notification_data) {
            return;
        }

        this.current_notification_data = notification_data;

        this.startCooldownTimer();
    }

    /**
     * Clear all the timers and notification data
     * @returns {string} Last {@link current_message_id}
     */
    clear() {
        clearTimeout(this.pending_notification_data_timer);
        clearTimeout(this.cooldown_timer);

        this.pending_notification_data_timer = null;
        this.current_notification_data = null;
        this.cooldown_timer = null;

        const current_message_id = `${this.current_message_id}`;

        this.current_message_id = null;

        return current_message_id;
    }

    /**
     * Get discord channel url
     * @param {ChannelSubscriber.DiscordNotificationData} notification_data - Source notification data to get url from
     * @returns {string} Returns url (may be changed to support application redirect)
     */
    getChannelUrl(notification_data) {
        if(!notification_data) {
            return null;
        }
        return notification_data.channel_url.replace('discord.com', 'dr.bldbr.club');
    }

    /**
     * Generate message text from notification data
     * @param {ChannelSubscriber.DiscordNotificationData} notification_data - Source notification data for text
     * @returns {string} Message text
     */
    generateNotificationTextFrom(notification_data) {
        if (!notification_data) {
            return null;
        }
        let text = `<b>${notification_data.channel_name}</b>`;
        let icon;
        if (notification_data.channel_type && (icon = (icons[notification_data.channel_type] || icons[`${notification_data.channel_type}_channel`])) ) {
            text = `${icon}${wideSpace}${text}`
        }

        notification_data.members.forEach((member) => {
            text += `\n${member.member_name || member.user_name}`
                + (this.transformStatus(member) ? `${wideSpace}${this.transformStatus(member)}` : '')
                + (member.activity ? `${wideSpace}— <i>${member.activity}</i>` : '');
        });

        return text;
    }

    /**
     * Transform statuses to string with emojis
     * @param {object} params
     * @param {boolean} params.muted true if user is muted
     * @param {boolean} params.deafened true if user is deafened
     * @param {boolean} params.camera true if user's camera is on
     * @param {boolean} params.streaming true if user is streaming
     */
    transformStatus({ muted, deafened, camera, streaming }) {
        return (muted ? icons.mic_off : '')
            + (deafened ? icons.sound_off : '')
            + (camera ? icons.video_on : '')
            + (streaming ? icons.live : '');
    }

    /**
     * Get message text for {@link current_notification_data}
     * @returns {string} Message text
     */
    getNotificationText() {
        return this.generateNotificationTextFrom(this.current_notification_data);
    }

    /**
     * Get message text for {@link pending_notification_data}
     * @returns {string} Pending message text
     */
    getPendingNotificationText() {
        return this.generateNotificationTextFrom(this.pending_notification_data);
    }

    /**
     * Get keyboard for the message with channel url
     * @returns {import('grammy').InlineKeyboard}
     */
    getNotificationKeyboard() {
        return new InlineKeyboard().url(
            'Присоединиться',
            this.getChannelUrl(this.current_notification_data)
        );
    }

    /**
     * Schedule message update after cooldown
     * @param {ChannelSubscriber.DiscordNotificationData} notification_data - new {@link pending_notification_data}
     * @param {(DiscordNotification) => Promise} callback - Callback that should be called when {@link pending_notification_timer} fires
     */
    suspendNotification(notification_data, callback) {
        clearTimeout(this.pending_notification_data_timer);

        this.pending_notification_data = notification_data;
        this.pending_notification_data_timer = setTimeout(() => {
            this.update(this.pending_notification_data);
            callback(this);
            this.pending_notification_data = null;
            this.pending_notification_timer = null;
        }, this.cooldown_timeout - Date.now());
    }

    /**
     * Clear current {@link pending_notification_data} and {@link pending_notification_data_timer}
     */
    dropPendingNotification() {
        clearTimeout(this.pending_notification_data_timer);

        this.pending_notification_data = null;
        this.pending_notification_timer = null;
    }

    /**
     * Get additional logging info
     * @returns {object} Object containing info about this {@link DiscordNotificationData}
     */
    getLogMeta() {
        let meta = {};

        meta['discord_channel'] = this.channel_name;
        meta['discord_channel_id'] = this.channel_id;
        meta['discord_guild'] = this.guild_name;
        meta['discord_guild_id'] = this.guild_id;
        meta['telegram_chat_id'] = this.chat_id;


        if (this.isNotified()) {
            meta['pending_notification_data_exists'] = !!this.pending_notification_data;
            meta['telegram_message_id'] = this.current_message_id;
        }

        return meta;
    }
}

/**
 * Pin notification message in chat
 * @param {ChannelSubscriber.DiscordNotification} discord_notification 
 * @returns {Promise<Message>}
 * @memberof ChannelSubscriber
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
 * Get {@link DiscordNotification} for supplied notification_data
 * @param {ChannelSubscriber.DiscordNotificationData | ChannelSubscriber.DiscordNotification | null} notification_data - Source data
 * @param {string | number} chat_id - Telegram chat id
 * @returns {ChannelSubscriberDiscordNotification}
 * @memberof ChannelSubscriber
 */
function getDiscordNotification(notification_data, chat_id) {
    if (notification_data instanceof DiscordNotification) {
        return notification_data;
    }

    if (!discord_notification_map[`${chat_id}:${notification_data.channel_id}`]) {
        discord_notification_map[`${chat_id}:${notification_data.channel_id}`] = new DiscordNotification(notification_data, chat_id);
    }

    return discord_notification_map[`${chat_id}:${notification_data.channel_id}`];
}

/**
 * Delete notification message from telegram chat
 * @param {ChannelSubscriberDiscordNotification} discord_notification - {@link DiscordNotification} that is associated with notification message
 * @returns {Promise}
 * @memberof ChannelSubscriber
 */
function clearNotification(discord_notification) {
    if (!discord_notification.isNotified()) {
        logger.debug(
            `No channel state notification to clear about [channel:${discord_notification.channel_id}] in [chat:${discord_notification.chat_id}]`,
            { ...discord_notification.getLogMeta() }
        );
        return;
    }

    return bot.api.deleteMessage(
        discord_notification.chat_id,
        discord_notification.current_message_id
    ).then(() => {
        logger.debug(
            `Deleted channel state notification [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]`,
            { ...discord_notification.getLogMeta() }
        );
        discord_notification.clear();
    }).catch(err => {
        logger.error(
            `Error while clearing channel state notification [message: ${discord_notification.current_message_id}] about [channel_id: ${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]`,
            { error: err.stack || err, ...discord_notification.getLogMeta(), telegram_message_id: discord_notification.current_message_id }
        );
    });
}

/**
 * Send notification message to telegram chat
 * @param {ChannelSubscriber.DiscordNotification} discord_notification - {@link DiscordNotification} that is associated with notification message
 * @returns {Promise}
 * @memberof ChannelSubscriber
 */
function sendNotificationMessage(discord_notification) {
    return bot.api.sendMessage(
        discord_notification.chat_id,
        discord_notification.getNotificationText(),
        {
            link_preview_options: { is_disabled: true },
            parse_mode: 'HTML',
            reply_markup: discord_notification.getNotificationKeyboard()
        }
    ).then((message) => {
        discord_notification.current_message_id = message.message_id;
        logger.debug(
            `Sent channel state notification about [channel:${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}], got [message: ${message.message_id}]`,
            { ...discord_notification.getLogMeta() }
        );
        pinNotificationMessage(discord_notification);
    }).catch((err) => {
        logger.error(
            `Error while sending channel state notification about [channel: ${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}]`,
            { error: err.stack || err, ...discord_notification.getLogMeta() }
        );
    });
}

/**
 * Edit existing notification message with current notification data 
 * @param {ChannelSubscriber.DiscordNotification} discord_notification - {@link DiscordNotification} that is associated with notification message
 * @returns {Promise}
 * @memberof ChannelSubscriber
 */
function editNotificationMessage(discord_notification) {
    return bot.api.editMessageText(
        discord_notification.chat_id,
        discord_notification.current_message_id,
        discord_notification.getNotificationText(),
        {
            link_preview_options: { is_disabled: true },
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
        if (err.description.search('message to edit not found') !== -1) {
            logger.info(`[message: ${discord_notification.current_message_id}] doesn't exist, sending new message instead`);
            discord_notification.current_message_id = null;
            return sendNotificationMessage(discord_notification);
        }
        logger.error(
            `Error while editing [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]`, 
            { error: err.stack || err, ...discord_notification.getLogMeta() }
        );
    });
}

/**
 * Wraps the send / update of the notificatin data to telegram chat
 * @param {ChannelSubscriber.DiscordNotification} notification_data - Source notification data
 * @param {number | string} chat_id - Telegram chat id
 * @returns {Promise}
 * @memberof ChannelSubscriber
 */
async function wrapInCooldown(notification_data, chat_id) {
    const discord_notification = getDiscordNotification(notification_data, chat_id);

    if (discord_notification.isNotified()) {
        if (discord_notification.generateNotificationTextFrom(notification_data) == discord_notification.getNotificationText()) {
            logger.debug(
                `Skipping channel state notification about [channel: ${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}] as equals to current`,
                { ...discord_notification.getLogMeta() }
            );
            discord_notification.dropPendingNotification();
            return;
        }

        if (discord_notification.isCooldownActive()) {
            logger.debug(
                `Suspending channel state notification about [channel: ${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}]`,
                { ...discord_notification.getLogMeta() }
            );
            discord_notification.suspendNotification(notification_data, editNotificationMessage);
            return;
        }
    }
    else {
        discord_notification.current_message_id = await restoreMessageID(chat_id, discord_notification.channel_id);
    }
    
    
    discord_notification.update(notification_data);

    if (discord_notification.isNotified()) {
        return editNotificationMessage(discord_notification);
    }
    else {
        return sendNotificationMessage(discord_notification);
    }
}

/**
 * Interface for sending / updating the notification message from notification data
 * @param {ChannelSubscriber.DiscordNotificationData} notification_data 
 * @param {number | string} chat_id 
 * @returns {Promise}
 * @memberof ChannelSubscriber
 */
async function sendNotification(notification_data, chat_id) {
    if (!notification_data || !chat_id || !bot) return;

    if (!notification_data.members.length) {
        clearNotification(getDiscordNotification(notification_data, chat_id));
        return;
    }

    return wrapInCooldown(notification_data, chat_id);
}

/**
 * Interface for deleting the notification data for discord channe from telegram chat
 * @param {number | string} chat_id 
 * @param {string} channel_id 
 * @returns {Promise}
 * @memberof ChannelSubscriber
 */
async function deleteNotification(chat_id, channel_id) {
    if (!chat_id || !channel_id || !bot) return;

    if (!discord_notification_map[`${chat_id}:${channel_id}`]) return;

    clearNotification(discord_notification_map[`${chat_id}:${channel_id}`]);
    delete discord_notification_map[`${chat_id}:${channel_id}`]
}

/**
 * Interface for checking that telegram message in chat is a notification message
 * @param {string | number} chat_id 
 * @param {string | number} message_id 
 * @returns {boolean}
 * @memberof ChannelSubscriber
 */
function isNotificationMessage(chat_id, message_id) {
    if (!chat_id || !message_id) {
        return false;
    }
    return chat_notification_map?.[chat_id]?.has(message_id) || false;
}

module.exports = {
    sendNotification,
    deleteNotification,
    isNotificationMessage
}
