const { Bot, Context, webhookCallback, InputFile } = require('grammy');
const TelegramHandler = require('./telegram-handler');
const config = require('../config.json');

const inline_template_regex = /\/.+ .*/gm;
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

    update(notification_data) {
        if (!notification_data) {
            this.current_notification_data = null;
            this.cooldown = false;
            this.pending_notification_data = null;

            return this.current_message_id;
        }

        this.current_notification_data = notification_data;

        this.cooldown = true;
        this.cooldown_timer = setTimeout(() => {
            this.cooldown = false;
        }, this.cooldown_duration);
    }

    clear() {
        clearTimeout(this.pending_notification_data_timer);
        clearTimeout(this.cooldown_timer);

        const current_message_id = `${this.update()}`;

        this.current_message_id = null;

        return current_message_id;
    }

    getNotificationText(notification_data = this.notification_data) {
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
            this.update(notification_data);
            callback(this)
        }, this.cooldown_duration);

        this.cooldown = true;
        this.cooldown_timer = setTimeout(() => {
            this.cooldown = false;
        }, this.cooldown_duration);
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

    get cooldown_key() {
        return `${this.chat_id}`;
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
            reply_to_message_id: this.context.message?.message_id,
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

    _deleteCooldown(key) {
        delete this.client.cooldown_map[key].timer;
        if (!Object.keys(this.client.cooldown_map[key]).length) {
            delete this.client.cooldown_map[key];
        }
    }


    _cooldown() {
        this.client.cooldown_map[this.cooldown_key] = {
            timer: setTimeout(this._deleteCooldown.bind(this), this.client.cooldown_duration, this.cooldown_key),
            message_id: this.sent_message.message_id
        };
    }

    _isCooldown() {
        if (this.client.cooldown_map[this.cooldown_key]) {
            if (this.notification_data.type[0] === '-') {
                if (this.client.cooldown_map[this.cooldown_key].message_id) {
                    let message_id = this.client.cooldown_map[this.cooldown_key].message_id;
                    this.api.deleteMessage(this.chat_id, message_id);
                    delete this.client.cooldown_map[this.cooldown_key].message_id;

                    if (!Object.keys(this.client.cooldown_map[this.cooldown_key]).length) {
                        delete this.client.cooldown_map[this.cooldown_key];
                        return false;
                    }
                }
            }
            if (this.client.cooldown_map[this.cooldown_key].timer) {
                return true;
            }
        }
        return false;
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
        this.discord_notification_map = {};
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

    _registerCommands() {
        this.inline_commands = ['calc', 'ping', 'html', 'fizzbuzz', 'gh'];

        this.client.command('start', async (ctx) => new TelegramInteraction(this, 'start', ctx).reply());
        this.client.command('help', async (ctx) => new TelegramInteraction(this, 'help', ctx).reply());
        this.client.command('calc', async (ctx) => new TelegramInteraction(this, 'calc', ctx).reply());
        this.client.command('discord_notification', async (ctx) => new TelegramInteraction(this, 'discord_notification', ctx).reply());
        this.client.command('ping', async (ctx) => new TelegramInteraction(this, 'ping', ctx).reply());
        this.client.command('html', async (ctx) => new TelegramInteraction(this, 'html', ctx).reply());
        this.client.command('fizzbuzz', async (ctx) => new TelegramInteraction(this, 'fizzbuzz', ctx).reply());
        this.client.command('gh', async (ctx) => new TelegramInteraction(this, 'gh', ctx).reply());
        this.client.command('curl', async (ctx) => new TelegramInteraction(this, 'curl', ctx).reply());

        if (this.app && this.app.redis) {
            this.inline_commands = this.inline_commands.concat(['get', 'get_list']);
            this.client.command('set', async (ctx) => new TelegramInteraction(this, 'set', ctx).reply());
            this.client.command('get', async (ctx) => new TelegramInteraction(this, 'get', ctx).reply());
            this.client.command('get_list', async (ctx) => new TelegramInteraction(this, 'get_list', ctx).reply());
        }

        if (config.URBAN_API) {
            this.inline_commands.push('urban');
            this.client.command('urban', async (ctx) => new TelegramInteraction(this, 'urban', ctx).reply());
        }

        if (config.AHEGAO_API) {
            this.inline_commands.push('ahegao');
            this.client.command('ahegao', async (ctx) => new TelegramInteraction(this, 'ahegao', ctx).reply());
        }

        if (config.DEEP_AI_API) {
            // this.inline_commands.push('deep'); // Takes too long, InlineQuery id expires faster
            this.client.command('deep', async (ctx) => new TelegramInteraction(this, 'deep', ctx).reply());
        }

        if (config.WIKIPEDIA_SEARCH_URL) {
            this.inline_commands.push('wiki');
            this.client.command('wiki', async (ctx) => new TelegramInteraction(this, 'wiki', ctx).reply());
        }

        if (process.env.COINMARKETCAP_TOKEN && config.COINMARKETCAP_API) {
            this.inline_commands.push('cur');
            this.client.command('cur', async (ctx) => new TelegramInteraction(this, 'cur', ctx).reply());
        }

        this.client.on('inline_query', async (ctx) => new TelegramInteraction(this, 'inline_query', ctx).answer());
    }



    async start() {
        if (!process.env.TELEGRAM_TOKEN) {
            this.logger.warn(`Token for Telegram wasn't specified, client is not started.`);
            return;
        }

        this.client = new Bot(process.env.TELEGRAM_TOKEN);
        this._registerCommands();

        if (process.env.ENV === 'dev' || !process.env.PORT) {
            this._startPolling();
        }
        else {
            this._setWebhook();
        }
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

    async stop() {
        if (!process.env.TELEGRAM_TOKEN) {
            return;
        }
        this.logger.info('Gracefully shutdowning Telegram client.');
        await this.client.api.deleteWebhook();
        await this.client.stop();
        await this._setWebhook(); // restoring interrupted webhook if possible
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

    _getDiscordNotification(notification_data, chat_id) {
        let discord_notification = this.discord_notification_map[`${chat_id}:${notification_data.channel_id}`];
        if (!discord_notification) {
            this.discord_notification_map[`${chat_id}:${notification_data.channel_id}`] = new DiscordNotification(notification_data, chat_id);
            return this.discord_notification_map[`${chat_id}:${notification_data.channel_id}`];
        }
        return discord_notification;
    }

    _clearNotification(notification_data, chat_id) {
        const discord_notification = this._getDiscordNotification(notification_data, chat_id);

        if (!discord_notification.isNotified()) {
            return;
        }

        const current_message_id = discord_notification.clear();

        this.client.api.deleteMessage(chat_id, current_message_id).catch(err => {
            this.logger.error(`Error while clearing notification channel_id:${notification_data.channel_id} chat_id:${chat_id} : ${err && err.stack}`);
        });
    }

    async _sendNotificationMessage(discord_notification) {
        this.logger.info(`Sending [discord channel: ${discord_notification.channel_id}] [notification: ${discord_notification.getNotificationText()} to [telegram chat: ${discord_notification.chat_id}]`);
        return this.client.api.sendMessage(
            discord_notification.chat_id,
            discord_notification.getNotificationText(),
            {
                disable_web_page_preview: true,
                parse_mode: 'HTML',
            }
        );
    }

    async _updateNotificationMessage(discord_notification) {
        if (!discord_notification) {
            return;
        }

        if (discord_notification.current_message_id) {
            this.client.api.deleteMessage(discord_notification.chat_id, discord_notification.current_message_id).catch(err => {
                this.logger.error(`Error while deleting old notification channel_id:${discord_notification.channel_id} chat_id:${discord_notification.chat_id} : ${err && err.stack}`);
            });
        }

        try {
            discord_notification.current_message_id = await (await this._sendNotificationMessage(discord_notification)).message_id;
        }
        catch(err) {
            this.logger.error(`Errro while sending notification channel_id:${discord_notification.channel_id} chat_id:${discord_notification.chat_id} : ${err && err.stack}`);
        }
    }

    _wrapInCooldown(notification_data, chat_id) {
        const discord_notification = this._getDiscordNotification(notification_data, chat_id);

        if (discord_notification.isCooldownActive()) {
            this.logger.info(`Suspending [discord channel: ${discord_notification.channel_id}] [notification: ${discord_notification.getNotificationText(notification_data)} to [telegram chat: ${discord_notification.chat_id}]`);
            discord_notification.suspendNotification(notification_data, this._updateNotificationMessage.bind(this));
            return;
        }

        discord_notification.update(notification_data);
        this._updateNotificationMessage(discord_notification);
    }

    async sendNotification(notification_data, chat_id) {
        if (!notification_data || !chat_id || !this.client) return;

        if (!notification_data.members.size) {
            this._clearNotification(notification_data, chat_id);
            return;
        }

        this._wrapInCooldown(notification_data, chat_id);
    }

    webhookTimeoutCallback() {
        let logger = this.logger.child({ module: 'grammy-webhook' });
        logger.info('Webhook Handler ran out of time!!! This needs fix!');
    }
}

module.exports = TelegramClient;
