const { Bot, Context, webhookCallback, InputFile } = require('grammy');
const TelegramHandler = require('./telegram-handler');
const config = require('../config.json');

const inline_template_regex = /\/.+.*/gm;
const command_name_regex = /^\/[a-zA-Zа-яА-Я0-9_-]+/;

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
]

class DiscordNotification {
    constructor(notification_data, chat_id) {
        this.current_notification_data = notification_data;
        this.chat_id = chat_id;
        this.channel_id = notification_data.channel_id;

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

    get channel_name() {
        return this.current_notification_data.channel_name;
    }

    get members() {
        return this.current_notification_data.members;
    }

    isNotified() {
        return this.current_message_id && true || false;
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
        let text = `Канал <a href="${notification_data.channel_url}">${notification_data.channel_name}</a> в Discord:`;

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
        this.logger = client.logger.child({ module: 'telegram-interaction' });
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

    _parseMessageMedia() {
        const parsed_media = {};

        const message = this.context.message.reply_to_message;

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

    async sendNotification(notification_data, chat_id) {
        this.notification_data = notification_data;
        this.chat_id = chat_id;
        if (this._isCooldown()) return;

        let message = undefined;
        if (this.notification_data.type === 'foreveralone') {
            message = `Вы оставили ${this.notification_data.user_name} сидеть <a href="${this.notification_data.channel_url}">там</a> совсем одного, может он и выйдет сам, а может быть и нет`;
        }
        if (this.notification_data.type === 'new_stream') {
            message = `${this.notification_data.user_name} начал стрим в канале <a href="${this.notification_data.channel_url}">${this.notification_data.channel_name}</a>, приходите посмотреть`;
        }
        if (this.notification_data.type === 'first_join') {
            message = `${this.notification_data.user_name} уже сидит один в канале <a href="${this.notification_data.channel_url}">${this.notification_data.channel_name}</a>, составьте ему компанию чтоль`;
        }

        if (!message) return;
        this.logger.info(`Sending message [${message}]`);
        this.sent_message = await this.api.sendMessage(this.chat_id, message, { parse_mode: 'HTML', disable_web_page_preview: true });
        this._cooldown();
    }

    /**
     * Reply to message with text
     * @param {String} text text to send
     * @return {Object}
     */
    async _reply(text, overrides) {
        this.logger.info(`Replying with [${text}]`);
        try {
            return await this.context.reply(text, {
                ...this._getBasicMessageOptions(),
                ...this._getTextOptions(),
                ...overrides
            });
        } catch (err) {
            this.logger.error(`Could not send message, got an error: ${err && err.stack}`);
            return await this._reply(`Не смог отправить ответ, давай больше так не делать`);
        }
    }

    /**
     * Reply to message with media group
     * 
     * @param {Object} message contains media group 
     * @param {Object | null} overrides 
     * @returns 
     */
    async _replyWithMediaGroup(message, overrides) {
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
            this.logger.error(`No suitable media found in [${message}]`);
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

        this.logger.info(`Replying with [${JSON.stringify(media)}]`);
        return this.context.replyWithMediaGroup(media, message_options);
    }

    /**
     * Reply to message with media file
     * 
     * @param {Object} message may contain text and an id of one of `[animation, audio, document, video, video_note, voice, sticker]`
     * @return {Message | null}
     */
    async _replyWithMedia(message, overrides) {
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
            this.logger.info(`Replying with [${message_options.caption ? `${message_options.caption} ` : ''}${message.type}:${message.filename ? message.filename : media}]`);
            return replyMethod(media, message_options);
        }

        this.logger.info(`Can't send message as media ${JSON.stringify(message)}`);
        return this._reply(message.text);
    }

    async replyWithPlaceholder(placeholder_text) {
        if (this.context.message) {
            this._placeholderMessage = await this._reply(placeholder_text);
        }
    }

    async deletePlaceholder() {
        if (this._placeholderMessage) {
            return this.api.deleteMessage(this.context.chat.id, this._placeholderMessage.message_id);
        }
    }

    async reply() {
        try {
            if (typeof this.handler[this.command_name] === 'function') {
                this.logger.info(`Received command: ${this.context.message.text}`);

                this.handler[this.command_name](this.context, this).then(([err, response, _, overrides]) => {
                    if (err) {
                        return this._reply(err, overrides).then(this.deletePlaceholder.bind(this)).catch((err) => {
                            this.logger.error(`Error while replying with an error message to [${this.context.message.text}]: ${err.stack}`);
                            this._reply(`Что-то случилось:\n<code>${err}</code>`);
                        });
                    }
                    if (response instanceof String || typeof response === 'string') {
                        return this._reply(response, overrides).then(this.deletePlaceholder.bind(this)).catch((err) => {
                            this.logger.error(`Error while replying with response text to [${this.context.message.text}]: ${err.stack}`);
                            this._reply(`Что-то случилось:\n<code>${err}</code>`);
                        });
                    }
                    if (response instanceof Object) {
                        return this._replyWithMedia(response, overrides).then(this.deletePlaceholder.bind(this)).catch((err) => {
                            this.logger.error(`Error while replying with media to [${this.context.message.text}]: ${err.stack}`);
                            this._reply(`Что-то случилось:\n<code>${err}</code>`);
                        });
                    }
                }).catch((err) => {
                    this.logger.error(`Error while processing command [${this.context.message.text}]: ${err.stack}`);
                    this._reply(`Что-то случилось:\n<code>${err}</code>`);
                });
            }
            else {
                this.logger.info(`Received nonsense, how did it get here???: ${this.context.message.text}`);
            }
        }
        catch (err) {
            this.logger.error(`Error while processing command [${this.context.message.text}]: ${err.stack}`);
            this._reply(`Что-то случилось:\n<code>${err}</code>`);
        }
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
        await this._redis.hset(key, { data: JSON.stringify(data) });
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

    async _answerQueryWithText(query, overrides) {
        let answer = {
            results: [
                {
                    id: Date.now(),
                    type: 'article',
                    title: query.replace(/ +/g, ' '),
                    input_message_content: {
                        message_text: query,
                        ...this._getTextOptions(),
                        ...overrides,
                    },
                    ...this._getTextOptions(),
                    ...overrides,
                }
            ],
            other: {
                cache_time: 0
            }
        }
        this.logger.info(`Responding to inline query with text [${JSON.stringify(answer)}]`);
        try {
            return await this.context.answerInlineQuery(answer.results, answer.other);
        }
        catch (err) {
            this.logger.error(`Could not answer query, got an error: ${err && err.stack}`);
        }
    }

    async _answerQueryWithArray(answer) {
        this.logger.info(`Responding to inline query with [${JSON.stringify(answer)}]`);
        try {
            return await this.context.answerInlineQuery(answer.results, answer.other);
        }
        catch (err) {
            this.logger.error(`Could not answer query, got an error: ${err && err.stack}`);
        }
    }

    async answer() {
        if (!this.context.inlineQuery.query) {
            return;
        }
        this.logger.info(`Received inline query [${this.context.inlineQuery.query}]`);
        try {
            let parsed_context = {
                chat: {
                    id: this.context.inlineQuery.from.id
                },
                from: this.context.inlineQuery.from
            };

            let query_result = {
                results: [],
                other: {
                    cache_time: 0
                }
            }

            let query = this.context.inlineQuery.query;

            let template_matches = query.match(inline_template_regex);

            if (!template_matches?.length) {
                return await this._answerQueryWithText(this.context.inlineQuery.query);
            }
            this.logger.info(`Matched template commands [${JSON.stringify(template_matches)}]`);
            let clean_query = query.replace(inline_template_regex, '').replace(/ +/g, ' ');

            for (let match of template_matches) {
                let command_name = match.match(command_name_regex)[0].slice(1);
                if (this.client.inline_commands.includes(command_name) && typeof this.handler[command_name] === 'function') {
                    let input = Object.assign({ message: { text: match } }, parsed_context)
                    try {
                        const [err, response, _, overrides] = await this.handler[command_name](input, this);
                        if (err) {
                            query = query.replace(match, 'ОШИБКА');

                            return await this._answerQueryWithText(query, overrides);
                        }
                        else if (response) {
                            if (response instanceof String || typeof response === 'string') {
                                query = query.replace(match, response);

                                return await this._answerQueryWithText(query, overrides);
                            }
                            else if (response.type === 'text') {
                                let answer = {
                                    id: Date.now(),
                                    type: 'article',
                                    title: match,
                                    description: response.text,
                                    input_message_content: {
                                        message_text: response.text,
                                        ...this._getTextOptions(),
                                        ...overrides,
                                    },
                                    ...this._getTextOptions(),
                                    ...overrides,
                                }
                                query_result.results.push(answer);

                                return await this._answerQueryWithArray(query_result, overrides);
                            }
                            else if (['animation', 'audio', 'document', 'video', 'voice', 'photo', 'gif', 'sticker'].includes(response.type)) {
                                query = query.replace(match, '');
                                let suffix = response.url ? '_url' : '_file_id';
                                let data = response.url ? response.url : response.media || response[response.type];
                                let answer = {
                                    id: Date.now(),
                                    type: response.type === 'animation' ? 'gif' : response.type,
                                    title: response.text ? response.text : clean_query,
                                    caption: response.text ? response.text : clean_query,
                                    ...this._getTextOptions(),
                                };
                                answer[`${response.type === 'animation' ? 'gif' : response.type}${suffix}`] = data;
                                if (response.url) {
                                    answer['thumb_url'] = response.type !== 'video' ? response.url : config.VIDEO_THUMB_URL;
                                }

                                for (let key in answer) {
                                    if (!answer[key]) {
                                        delete answer[key];
                                    }
                                }

                                if (!answer.title) {
                                    answer.title = ' ';
                                }

                                this.logger.info(`Pushing answer [${JSON.stringify(answer)}]`);
                                query_result.results.push(answer);

                                return await this._answerQueryWithArray(query_result, overrides);
                            }
                        }
                    }
                    catch (err) {
                        this.logger.error(`Error while processing command [${command_text}] from inline query[${this.context.inlineQuery.query}]: ${err && err.stack}`);
                        query = query.replace(command_text, 'ОШИБКА');
                    }
                }
            }
        }
        catch (err) {
            this.logger.error(`Error while processing inline query [${this.context.inlineQuery.query}]: ${err && err.stack}`);
        }
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
        this.logger = app.logger.child({ module: 'telegram-client' });
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
    _registerCommand(command_name, condition = true, is_inline = false, handle_function_name = command_name) {
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

    _autoReplyToMisha() {
        if (process.env.MISHA_KUPI_KOLDU) {
            this.client.on('msg', async (ctx) => {
                if (ctx.message?.from?.id === Number(process.env.MISHA_KUPI_KOLDU)) {
                    ctx.reply('Миша купи колду', { reply_to_message_id: ctx.message.message_id });
                }
            })
        }
    }

    _filterServiceMessages() {
        this.client.on('message:pinned_message', async (ctx) => {
            if (ctx.message?.pinned_message?.from?.is_bot) {
                ctx.deleteMessage().catch((err) => {
                    this.logger.error(`Error while deleting service [message: ${ctx.message.message_id}] in [chat: ${ctx.chat.id}] : ${err && err.stack}`);
                });
            }
        });
    }

    _registerCommands() {
        this._registerCommand('start');
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
            this.logger.error(`Error while starting Telegram client: ${err && err.stack}`);
            this.health = 'off';
        });
    }

    async _setWebhook(webhookUrl = this._interruptedWebhookURL) {
        if (!webhookUrl) {
            webhookUrl = `${config.DOMAIN}/telegram-${Date.now()}`;
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
        catch(err) {
            this.logger.error(`Error while setting telegram webhook: ${err && err.stack}`);
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
        this._registerCommands();
        this._filterServiceMessages();
        this._autoReplyToMisha();

        if (process.env.ENV === 'dev' || !process.env.PORT) {
            this._startPolling();
        }
        else {
            this._setWebhook();
        }
    }

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

    _clearNotification(discord_notification) {
        if (!discord_notification.isNotified()) {
            return;
        }

        const current_message_id = discord_notification.clear();

        return this.client.api.deleteMessage(discord_notification.chat_id, current_message_id).catch(err => {
            this.logger.error(`Error while clearing notification [message: ${current_message_id}] about [channel_id: ${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}] : ${err && err.stack}`);
        });
    }

    async stop() {
        if (!process.env.TELEGRAM_TOKEN) {
            return;
        }
        this.logger.info('Gracefully shutdowning Telegram client.');

        for(let discord_notification of Object.values(this._discord_notification_map)) {
            await this._clearNotification(discord_notification);
        }
        await this.client.api.deleteWebhook();
        await this.client.stop();
        await this._setWebhook(); // restoring interrupted webhook if possible
    }

    _pinNotificationMessage(discord_notification) {
        return this.client.api.pinChatMessage(
            discord_notification.chat_id, 
            discord_notification.current_message_id,
            {
                disable_notification: true,
            }
        ).then(() => {
            this.logger.info(`Pinned [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]`);
        }).catch((err) => {
            this.logger.error(`Error while pinning [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}]: ${err && err.stack}`);
        });
    }

    _sendNotificationMessage(discord_notification) {
        return this.client.api.sendMessage(
            discord_notification.chat_id,
            discord_notification.getNotificationText(),
            {
                disable_web_page_preview: true,
                parse_mode: 'HTML',
            }
        ).then((message) => {
            this.logger.info(`Sent [notification: ${discord_notification.getNotificationText()}] about [channel:${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}], got [message: ${message.message_id}]`);
            discord_notification.current_message_id = message.message_id;
            this._pinNotificationMessage(discord_notification);
        }).catch((err) => {
            this.logger.error(`Error while sending [notification: ${discord_notification.getNotificationText(notification_data)}] about [channel: ${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}] : ${err && err.stack}`);
        });
    }

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
            this.logger.info(`Edited [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}] with [notification: ${discord_notification.getNotificationText()}]`);
        }).catch((err) => {
            this.logger.error(`Error while editing [message: ${discord_notification.current_message_id}] about [channel:${discord_notification.channel_id}] in [chat: ${discord_notification.chat_id}] with [notification: ${discord_notification.getNotificationText()}]: ${err && err.stack}`);
        });
    }

    _wrapInCooldown(notification_data, chat_id) {
        const discord_notification = this._getDiscordNotification(notification_data, chat_id);

        if (discord_notification.isNotified() && discord_notification.isCooldownActive()) {
            this.logger.info(`Suspending [notification: ${discord_notification.getNotificationText(notification_data)}] about [channel: ${discord_notification.channel_id}] to [chat: ${discord_notification.chat_id}]`);
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

        if (!notification_data.members.size) {
            this._clearNotification(this._getDiscordNotification(notification_data, chat_id));
            return;
        }

        this._wrapInCooldown(notification_data, chat_id);
    }
}

module.exports = TelegramClient;
