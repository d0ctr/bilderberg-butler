const { Bot, Context, webhookCallback, InputFile } = require('grammy');
const TelegramHandler = require('./telegram-handler');
const config = require('../config.json');

const inline_query_input_regex = /^\/.+.*/gm;
const command_name_regex = /^\/[a-zA-Zа-яА-Я0-9_-]+/;
const no_tags_regex = /<\/?[^>]+(>|$)/g;

const media_types = [
    'audio',
    'animation',
    'chat_action',
    'contact',
    'dice',
    'document',
    'game',
    'invoice',
    'location',
    'photo',
    'poll',
    'sticker',
    'venue',
    'video',
    'video_note',
    'voice',
    'text',
];

const inline_answer_media_types = [
    'animation',
    'audio',
    'video',
    'document',
    'voice',
    'photo',
    'gif',
    'sticker'
];

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

    getNotificationText(notification_data = this) {
        let text = `Канал <a href="${process.env.DOMAIN ? `${process.env.DOMAIN}/discordredirect/${notification_data.channel_url.replace(/.*discord.com\//, '')}` : notification_data.channel_url}">${notification_data.channel_name}</a> в Discord:`;

        notification_data.members.forEach((member) => {
            text += `\n${member.user_name}\t\
${member.muted && '🔇' || ' '}\
${member.deafened && '🔕' || ' '}\
${member.streaming && '🎥' || ' '}`;
        });

        return text;
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
 * One time use interaction between app and telegram
 * @property {TelegramClient} this.client
 * @property {String?} this.command_name
 * @property {Context?} this.context
 */
class TelegramInteraction {
    /**
     * One time use interaction between app and telegram
     * @param {TelegramClient} client
     * @param {String} [command_name]
     * @param {Context} [context]
     */
    constructor(client, command_name, context) {
        this.client = client;
        this.log_meta = {
            module: 'telegram-interaction',
            command_name: command_name,
            telegram_chat_id: context?.chat?.id,
            telegram_chat: context?.chat?.title || context?.chat?.username,
            telegram_message_id: context?.message?.message_id,
            telegram_message: context?.message?.text,
            telegram_placeholder_message_id: this?._placeholderMessage?.message_id,
            telegram_placeholder_message: this?._placeholderMessage?.text,
        };
        this.logger = require('../logger').child(this.log_meta);
        this.command_name = command_name;
        this.context = context;
        this.handler = client.handler;
        this._redis = client.redis;
        this._currencies_list = client.currencies_list

        if (context) {
            this.mediaToMethod = {
                'audio': this.context.replyWithAudio.bind(this.context),
                'animation': this.context.replyWithAnimation.bind(this.context),
                'chat_action': this.context.replyWithChatAction.bind(this.context),
                'contact': this.context.replyWithContact.bind(this.context),
                'dice': this.context.replyWithDice.bind(this.context),
                'document': this.context.replyWithDocument.bind(this.context),
                'game': this.context.replyWithGame.bind(this.context),
                'invoice': this.context.replyWithInvoice.bind(this.context),
                'location': this.context.replyWithLocation.bind(this.context),
                'media_group': this.context.replyWithMediaGroup.bind(this.context),
                'photo': this.context.replyWithPhoto.bind(this.context),
                'poll': this.context.replyWithPoll.bind(this.context),
                'sticker': this.context.replyWithSticker.bind(this.context),
                'venue': this.context.replyWithVenue.bind(this.context),
                'video': this.context.replyWithVideo.bind(this.context),
                'video_note': this.context.replyWithVideoNote.bind(this.context),
                'voice': this.context.replyWithVoice.bind(this.context),
                'text': this.context.reply.bind(this.context),
            };
        }
    }

    /**
     * @returns {Telegram}
     */
    get api() {
        return this.client.client.api;
    }

    _parseMessageMedia(message) {
        if (!message) return;

        const parsed_media = {};

        parsed_media.text = message.text || message.caption;

        parsed_media.type = Object.keys(message).filter(key => media_types.includes(key))[0];

        if (parsed_media.type === 'photo') {
            parsed_media.media = message.photo[0].file_id;
        }
        else if (parsed_media.type !== 'text') {
            parsed_media.media = message[type].file_id;
        }

        return parsed_media;
    }

    _getBasicMessageOptions() {
        return {
            allow_sending_without_reply: true,
            reply_to_message_id: this.context.message?.reply_to_message?.message_id || this.context.message?.message_id,
        };
    }

    _getTextOptions() {
        return {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
        };
    }

    /**
     * Get reply method associated with content type
     * @param {String} media_type 
     * @return {Context.reply}
     */
    _getReplyMethod(media_type) {
        return this.mediaToMethod[media_type];
    }

    /**
     * Reply to message with text
     * @param {String} text text to send
     * @return {Promise<Message>}
     */
    _reply(text, overrides) {
        this.logger.info(`Replying with [${text}]`);
        return this.context.reply(text, {
            ...this._getBasicMessageOptions(),
            ...this._getTextOptions(),
            ...overrides
        });
    }

    /**
     * Reply to message with media group
     * 
     * @param {Object} message contains media group 
     * @param {Object | null} overrides 
     * @returns {Promise<Message>}
     */
    _replyWithMediaGroup(message, overrides) {
        if (message.type === 'text') {
            return this._reply(message.text, overrides)
        }

        const message_options = {
            ...this._getBasicMessageOptions(),
            ...overrides
        }

        const media = message.media.filter((singleMedia) => {
            if (['audio', 'document', 'photo', 'video'].includes(singleMedia.type)) {
                return singleMedia;
            }
        });

        if (!media.length) {
            this.logger.warn(`No suitable media found in [${JSON.stringify(message)}]`);
            return this._reply(message.text);
        }

        media[0] = {
            ...media[0],
            ...this._getTextOptions(),
            ...overrides
        };

        if (message.text) {
            media[0].caption = media[0].caption ? `${media[0].caption}\n${message.text}` : message.text;
        }

        this.logger.info(`Replying with [${JSON.stringify(media)}]`, { response: media });
        return this.context.replyWithMediaGroup(media, message_options);
    }

    /**
     * Reply to message with media file
     * 
     * @param {Object} message may contain text and an id of one of `[animation, audio, document, video, video_note, voice, sticker]`
     * @return {Promise<Message>}
     */
    _replyWithMedia(message, overrides) {
        if (message.type === 'text') {
            return this._reply(message.text, overrides);
        }

        if (message.type === 'media_group') {
            return this._replyWithMediaGroup(message, overrides);
        }

        let message_options = {
            caption: message.text,
            ...this._getBasicMessageOptions(),
            ...this._getTextOptions(),
            ...overrides
        };

        let media = message.filename ? new InputFile(message.media, message.filename) : message.media || message[message.type];

        const replyMethod = this._getReplyMethod(message.type);

        if (typeof replyMethod === 'function') {
            this.logger.info(`Replying with [${message_options.caption ? `${message_options.caption} ` : ''}${message.type}:${message.filename ? message.filename : media}]`, { response: message, response_options: message_options });
            return replyMethod(media, message_options);
        }

        this.logger.info(`Can't send message as media [${JSON.stringify(message)}]`, { media: message });
        return this._reply(message.text);
    }

    replyWithPlaceholder(placeholder_text) {
        if (this.context.message) {
            this._reply(
                placeholder_text
            ).then(message => {
                this._placeholderMessage = message;
                this.logger.debug(`Sent placeholder [message:${message.message_id}] with [text:${placeholder_text}] in reply to [message:${this._getBasicMessageOptions().reply_to_message_id}]`);
            }).catch(err =>
                this.logger.error(`Error while sending placeholder message [text: ${placeholder_text}] in reply to [message_id: ${this.context.message.message_id}] in [chat: ${this.context.chat.id}]: ${err.stack || err}`, { error: err.stack || err })
            );
        }
    }

    deletePlaceholder() {
        if (!this._placeholderMessage) return;
        this.api.deleteMessage(
            this.context.chat.id,
            this._placeholderMessage.message_id
        ).then(() => {
            this.logger.debug(`Deleted placeholder [message:${this._placeholderMessage.message_id}] with [text:${this._placeholderMessage.text}] in reply to [message:${this._getBasicMessageOptions().reply_to_message_id}]`);
            delete this._placeholderMessage;
        }).catch(err =>
            this.logger.error(`Error while deleting placeholder message [message_id: ${this._placeholderMessage.message_id}] in [chat: ${this._placeholderMessage.chat.id}]: ${err.stack || err}`, { error: err.stack || err })
        );
    }

    reply() {
        if (typeof this.handler[this.command_name] !== 'function') {
            this.logger.warn(`Received nonsense, how did it get here???: ${this.context.message.text}`);
            return;
        }

        this.logger.info(`Received command: ${this.context.message.text}`);

        this.handler[this.command_name](this.context, this).then(([err, response, _, overrides]) => {
            if (err) {
                return this._reply(err, overrides).then(this.deletePlaceholder.bind(this)).catch((err) => {
                    this.logger.error(`Error while replying with an error message to [${this.context?.message?.text}]: ${err.stack || err}`, { error: err.stack || err });
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply dropped: ${err.stack || err}`, { error: err.stack || err }));
                });
            }
            if (response instanceof String || typeof response === 'string') {
                return this._reply(response, overrides).then(this.deletePlaceholder.bind(this)).catch((err) => {
                    this.logger.error(`Error while replying with response text to [${this.context?.message?.text}]: ${err.stack || err}`);
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply dropped: ${err.stack || err}`, { error: err.stack || err }));
                });
            }
            if (response instanceof Object) {
                return this._replyWithMedia(response, overrides).then(this.deletePlaceholder.bind(this)).catch((err) => {
                    this.logger.error(`Error while replying with media to [${this.context?.message?.text}]: ${err.stack || err}`);
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply dropped: ${err.stack || err}`, { error: err.stack || err }));
                });
            }
        }).catch((err) => {
            this.logger.error(`Error while processing command [${this.context.message.text}]: ${err.stack || err}`, { error: err.stack || err });
            this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply dropped: ${err.stack || err}`, { error: err.stack || err }));
        });
    }

    async redisGet(name) {
        if (!this._redis) {
            throw new Error('Storage is offline');
        }
        let key = `${this.context.chat?.id || this.context.from.id}:get:${name}`;
        let result = await this._redis.hgetall(key);
        return result.data ? JSON.parse(result.data) : result; // legacy support for not stringified get-s
    }

    async redisSet(name, data) {
        if (!this._redis) {
            throw new Error('Storage is offline');
        }
        let key = `${this.context.chat.id || this.context.from.id}:get:${name}`;
        for (let i in data) {
            if (!data[i]) {
                delete data[i];
            }
        }
        if (!Object.keys(data).length) {
            new Error('Cannot save empty data');
        }
        return this._redis.hset(key, { data: JSON.stringify(data) });
    }

    async redisGetList() {
        if (!this._redis) {
            throw new Error('Storage is offline');
        }
        let key = `${this.context.chat?.id || this.context.from.id}:get:*`;
        let r_keys = await this._redis.keys(key);
        let keys = [];
        for (let r_key of r_keys) {
            keys.push(r_key.split(':').slice(-1)[0]);
        }
        return keys;
    }

    getCurrency(name) {
        return this._currencies_list ? this._currencies_list[name] : null;
    }

    /**
     * Answeres inline query with text ("article")
     * @param {String} text 
     * @param {Object} overrides 
     * @returns {Promise}
     */
    async _answerQueryWithText(text, overrides) {
        let answer = {
            results: [
                {
                    id: Date.now(),
                    type: 'article',
                    title: text.split('\n')[0].replace(no_tags_regex, ''),
                    input_message_content: {
                        message_text: text,
                        ...this._getTextOptions(),
                        ...overrides,
                    },
                    ...this._getTextOptions(),
                    ...overrides,
                }
            ],
            other: {
                cache_time: 0,
                ...overrides,
            }
        };

        this.logger.info(`Responding to inline query with text [${JSON.stringify(answer)}]`);

        return this.context.answerInlineQuery(answer.results, answer.other);
    }

    async _answerQueryWithMedia(media, overrides) {
        if (media.type === 'text') return this._answerQueryWithText(media.text, overrides);

        let answer = {
            results: [],
            other: {
                cache_time: 0,
                ...overrides,
            }
        };

        if (!inline_answer_media_types.includes(media.type)) {
            this.logger.warn(`Can't answer inline query with [media: ${JSON.stringify(media)}]`);
            return;
        }

        let suffix = media.url ? '_url' : '_file_id';
        let data = media.url ? media.url : media.media || media[media.type];
        let inline_type = media.type === 'animation' ? 'gif' : media.type;
        let result = {
            id: Date.now(),
            type: inline_type,
            title: media.text ? media.text.split('\n')[0] : ' ',
            caption: media.text,
            ...this._getTextOptions(),
            ...overrides,
        };
        result[`${inline_type}${suffix}`] = data;
        if (media.url) {
            result['thumb_url'] = media.type !== 'video' ? media.url : config.VIDEO_THUMB_URL;
        }

        for (let key in result) {
            if (!result[key]) {
                delete result[key];
            }
        }

        if (!result.title) {
            result.title = ' ';
        }

        answer.results.push(result);

        this.logger.info(`Responding to inline query with [${JSON.stringify(answer)}]`);

        return this.context.answerInlineQuery(answer.results, answer.other);
    }

    answer() {
        if (!this.context.inlineQuery.query) {
            return;
        }
        this.logger.debug(`Received inline query [${this.context.inlineQuery.query}]`);
        let input_matches = this.context.inlineQuery.query.match(inline_query_input_regex)
        let command_input = input_matches && input_matches[0];
        if (!command_input) return;

        let command_name = command_input.split(' ')[0].slice(1);
        if (!this.client.inline_commands.includes(command_name) || typeof this.handler[command_name] !== 'function') {
            return;
        }

        let parsed_context = {
            chat: {
                id: this.context.inlineQuery.from.id
            },
            from: this.context.inlineQuery.from,
            message: {
                text: command_input
            }
        };

        this.logger.info(`Received eligible inline query with input [${command_input}], parsed context [${JSON.stringify(parsed_context)}]`);

        this.handler[command_name](parsed_context, this).then(([err, response, _, overrides]) => {
            if (err) {
                this.logger.error(`Handler for [${command_input}] from inline query responded with error: ${err.stack || err}`, { error: err.stack || err });
                return;
            }
            if (response) {
                if (response instanceof String || typeof response === 'string') {
                    return this._answerQueryWithText(
                        response,
                        overrides
                    ).catch(err =>
                        this.logger.error(`Error while responsing to inline query [${command_input}] with text [${response && response.text}]: ${err.stack || err}`, { error: err.stack || err })
                    );
                }
                if (response instanceof Object) {
                    return this._answerQueryWithMedia(
                        response,
                        overrides
                    ).catch(err =>
                        this.logger.error(`Error while responding to inline query [${command_input}] with media [${JSON.stringify(response)}]: ${err.stack || err}`, { error: err.stack || err })
                    );
                }
            }
        }).catch(err => {
            this.logger.error(`Error while processing command [${command_input}]: ${err.stack || err}`, { error: err.stack || err });
        });
    }
}

class TelegramClient {
    /**
     * TelegramClient
     * @param {Object} app containing logger and redis
     */
    constructor(app) {
        this.app = app;
        this.redis = app.redis ? app.redis : null;
        this.log_meta = { module: 'telegram-client' };
        this.logger = require('../logger').child(this.log_meta);
        this.handler = new TelegramHandler(this);
        this.inline_commands = [];
        this._discord_notification_map = {};
    }

    set health(value) {
        this.app.health.telegram = value;
    }

    get health() {
        return this.app.health.telegram;
    }

    get currencies_list() {
        return this.app.currencies_list;
    }

    /**
     * 
     * @param {String} command_name command name
     * @param {* | Function?} condition {true} condition on which to register command or function that returns this condition
     * @param {Boolean?} is_inline {false} if command should be available for inline querying
     * @param {String?} handle_function_name {command_name} which function from TelegramHandler handles this command
     */
    _registerCommand(command_name, condition = false, is_inline = false, handle_function_name = command_name) {
        if (!command_name) {
            return;
        }

        if (typeof condition === 'function') {
            condition = condition();
        }

        if (!condition) {
            return;
        }

        this.client.command(command_name, async (ctx) => new TelegramInteraction(this, handle_function_name, ctx).reply());

        if (is_inline) {
            this.inline_commands.push(command_name);
        }
    }

    _filterServiceMessages() {
        this.client.on('message:pinned_message', async (ctx) => {
            if (ctx.message?.pinned_message?.from?.is_bot) {
                ctx.deleteMessage().catch((err) => {
                    this.logger.error(`Error while deleting service [message: ${ctx.message.message_id}] in [chat: ${ctx.chat.id}] : ${err.stack || err}`, { error: err.stack || err });
                });
            }
        });
    }

    _registerCommands() {
        this._registerCommand('start', true);
        this._registerCommand('help', true, true);
        this._registerCommand('calc', true, true);
        this._registerCommand('discord_notification');
        this._registerCommand('ping', true, true);
        this._registerCommand('html', true, true);
        this._registerCommand('fizzbuzz', true, true);
        this._registerCommand('gh', true, true);
        this._registerCommand('curl', true, true);
        this._registerCommand('set', this.app && this.app.redis);
        this._registerCommand('get', this.app && this.app.redis, true);
        this._registerCommand('get_list', this.app && this.app.redis, true);
        this._registerCommand('urban', config.URBAN_API, true);
        this._registerCommand('ahegao', config.AHEGAO_API, true);
        this._registerCommand('deep', config.DEEP_AI_API);
        this._registerCommand('wiki', config.WIKIPEDIA_SEARCH_URL, true);
        this._registerCommand('cur', process.env.COINMARKETCAP_TOKEN && config.COINMARKETCAP_API, true);

        this.client.on('inline_query', async (ctx) => new TelegramInteraction(this, 'inline_query', ctx).answer());
    }

    _saveInterruptedWebhookURL() {
        this.client.api.getWebhookInfo().then(({ url }) => {
            if (url) {
                this.logger.info(`Saving interrupted webhook url for restoration [${url}]`);
                this._interruptedWebhookURL = url;
            }
        })
    }

    _startPolling() {
        if (!process.env.TELEGRAM_TOKEN) {
            this.logger.warn(`Token for Telegram wasn't specified, client is not started.`);
            return;
        }

        this._saveInterruptedWebhookURL();

        this.client.start({
            onStart: () => {
                this.logger.info('Long polling is starting');
                this.health = 'ready';
            }
        }).then(() => {
            this.logger.info('Long polling has ended');
            this.health = 'off';
        }).catch(err => {
            this.logger.error(`Error while starting Telegram client: ${err.stack || err}`, { error: err.stack || err });
            this.health = 'off';
        });
    }

    async _setWebhook(webhookUrl) {
        if (!webhookUrl) {
            webhookUrl = `${process.env.DOMAIN}/telegram-${Date.now()}`;
        }

        try {
            await this.client.api.setWebhook(webhookUrl);

            if (this._interruptedWebhookURL) {
                this.logger.info(`Restored interrupted webhook url [${this._interruptedWebhookURL}]`);
            }
            else {
                this.logger.info('Telegram webhook is set.');
                this.health = 'set';
                this.app.api_server.setWebhookMiddleware(`/${webhookUrl.split('/').slice(-1)[0]}`, webhookCallback(this.client, 'express'));
            }
        }
        catch (err) {
            this.logger.error(`Error while setting telegram webhook: ${err.stack || err}`, { error: err.stack || err });
            this.logger.info('Trying to start with polling');
            this._startPolling();
        };
    }

    async start() {
        if (!process.env.TELEGRAM_TOKEN) {
            this.logger.warn(`Token for Telegram wasn't specified, client is not started.`);
            return;
        }

        this.client = new Bot(process.env.TELEGRAM_TOKEN);

        this.client.catch((err) => {
            this.logger.error(`High level middleware error in bot: ${err.stack || err}`, { error: err.stack || err });
        });

        this._registerCommands();
        this._filterServiceMessages();

        if (process.env.ENV.toLowerCase() === 'dev' || !process.env.PORT || !process.env.DOMAIN) {
            this._startPolling();
        }
        else {
            this._setWebhook();
        }
    }

    /**
     * 
     * @param {Object || DiscordNotification} notification_data 
     * @param {String} chat_id 
     * @returns {DiscordNotification}
     */
    _getDiscordNotification(notification_data, chat_id) {
        if (notification_data instanceof DiscordNotification) {
            return notification_data;
        }
        let discord_notification = this._discord_notification_map[`${chat_id}:${notification_data.channel_id}`];
        if (!discord_notification) {
            this._discord_notification_map[`${chat_id}:${notification_data.channel_id}`] = new DiscordNotification(notification_data, chat_id);
            return this._discord_notification_map[`${chat_id}:${notification_data.channel_id}`];
        }
        return discord_notification;
    }

    /**
     * 
     * @param {DiscordNotification} discord_notification 
     * @returns 
     */
    _clearNotification(discord_notification) {
        if (!discord_notification.isNotified()) {
            this.logger.debug(
                `No notification to clear about [channel:${discord_notification.channel_id}] in [chat:${discord_notification.chat_id}]`,
                { ...discord_notification.getLogMeta() }
            );
            return;
        }

        const current_message_id = discord_notification.clear();

        return this.client.api.deleteMessage(
            discord_notification.chat_id,
            current_message_id
        ).then(() => {
            this.logger.debug(
                `Deleted notification [message: ${current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]`,
                { ...discord_notification.getLogMeta(), telegram_message_id: current_message_id }
            );
        }).catch(err => {
            this.logger.error(
                `Error while clearing notification [message: ${current_message_id}] about [channel_id: ${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}] : ${err.stack || err}`,
                { error: err.stack || err, ...discord_notification.getLogMeta(), telegram_message_id: current_message_id }
            );
        });
    }

    async stop() {
        if (!process.env.TELEGRAM_TOKEN) {
            return;
        }
        this.logger.info('Gracefully shutdowning Telegram client.');

        for (let discord_notification of Object.values(this._discord_notification_map)) {
            await this._clearNotification(discord_notification);
        }
        await this.client.api.deleteWebhook();
        await this.client.stop();
        if (this._interruptedWebhookURL) {
            await this._setWebhook(this._interruptedWebhookURL); // restoring interrupted webhook if possible
        }
    }

    /**
     * 
     * @param {DiscordNotification} discord_notification 
     * @returns {Promise<Message>}
     */
    _pinNotificationMessage(discord_notification) {
        return this.client.api.pinChatMessage(
            discord_notification.chat_id,
            discord_notification.current_message_id,
            {
                disable_notification: true,
            }
        ).then(() => {
            this.logger.debug(
                `Pinned [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]`,
                { ...discord_notification.getLogMeta() }
            );
        }).catch((err) => {
            this.logger.error(
                `Error while pinning [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]: ${err.stack || err}`,
                { error: err.stack || err, ...discord_notification.getLogMeta() }
            );
        });
    }

    /**
     * 
     * @param {DiscordNotification} discord_notification 
     * @returns {Promise<Message>}
     */
    _sendNotificationMessage(discord_notification) {
        return this.client.api.sendMessage(
            discord_notification.chat_id,
            discord_notification.getNotificationText(),
            {
                disable_web_page_preview: true,
                parse_mode: 'HTML',
            }
        ).then((message) => {
            discord_notification.current_message_id = message.message_id;
            this.logger.debug(
                `Sent [notification: ${discord_notification.getNotificationText()}] about [channel:${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}], got [message: ${message.message_id}]`,
                { ...discord_notification.getLogMeta() }
            );
            this._pinNotificationMessage(discord_notification);
        }).catch((err) => {
            this.logger.error(
                `Error while sending [notification: ${discord_notification.getNotificationText(notification_data)}] about [channel: ${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}] : ${err.stack || err}`,
                { error: err.stack || err, ...discord_notification.getLogMeta() }
            );
        });
    }

    /**
     * 
     * @param {DiscordNotification} discord_notification 
     * @returns {Promise<Message>}
     */
    _editNotificationMessage(discord_notification) {
        return this.client.api.editMessageText(
            discord_notification.chat_id,
            discord_notification.current_message_id,
            discord_notification.getNotificationText(),
            {
                disable_web_page_preview: true,
                parse_mode: 'HTML',
            }
        ).then((message) => {
            discord_notification.current_message_id = message.message_id;
            this.logger.debug(
                `Edited [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}] with [notification: ${discord_notification.getNotificationText()}]`,
                { ...discord_notification.getLogMeta() }
            );
        }).catch((err) => {
            this.logger.error(
                `Error while editing [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}] with [notification: ${discord_notification.getNotificationText()}]: ${err.stack || err}`, 
                { error: err.stack || err, ...discord_notification.getLogMeta() }
            );
        });
    }

    _wrapInCooldown(notification_data, chat_id) {
        const discord_notification = this._getDiscordNotification(notification_data, chat_id);

        if (discord_notification.isNotified() && discord_notification.isCooldownActive()) {
            this.logger.debug(
                `Suspending [notification: ${discord_notification.getNotificationText(notification_data)}] about [channel: ${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}]`,
                { ...discord_notification.getLogMeta() }
            );
            discord_notification.suspendNotification(notification_data, this._editNotificationMessage.bind(this));
            return;
        }

        discord_notification.update(notification_data);

        if (discord_notification.isNotified()) {
            return this._editNotificationMessage(discord_notification);
        }
        else {
            return this._sendNotificationMessage(discord_notification);
        }
    }

    async sendNotification(notification_data, chat_id) {
        if (!notification_data || !chat_id || !this.client) return;

        if (!notification_data.members.length) {
            this._clearNotification(this._getDiscordNotification(notification_data, chat_id));
            return;
        }

        this._wrapInCooldown(notification_data, chat_id);
    }
}

module.exports = TelegramClient;
