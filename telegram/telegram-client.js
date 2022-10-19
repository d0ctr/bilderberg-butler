const { Bot, Context, webhookCallback, InputFile } = require('grammy');
const TelegramHandler = require('./telegram-handler');
const config = require('../config.json');
const { get_currencies_list } = require('../utils');

const inline_template_regex = /\{\{\/[^(\{\{)(\}\}))]+\}\}/gm;
const command_name_regex = /^\/[a-zA-Zа-яА-Я0-9_-]+/;

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
        this.logger = client.logger.child({module: 'telegram-interaction'});
        this.command_name = command_name;
        this.context = context;
        this.handler = client.handler;
        this._redis = client.redis;
        this._currencies_list = client.currencies_list
    }

    /**
     * @returns {Telegram}
     */
    get api() {
        return this.client.client.api;
    }

    get cooldown_key() {
        return `${this.notification_data.type[0] === '-' ? this.notification_data.type.slice(1) : this.notification_data.type}:${this.notification_data.user_id}:${this.chat_id}`;
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
                    this.client.client.api.deleteMessage(this.chat_id, message_id);
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

    _deleteCooldown(key) {
        delete this.client.cooldown_map[key].timer;
        if (!Object.keys(this.client.cooldown_map[key]).length) {
            delete this.client.cooldown_map[key];
        }
    }

    async respond() {
        try {
            if (typeof this.handler[this.command_name] === 'function') {
                this.logger.info(`Received command: ${this.context.message.text}`);
                const [err, response, _, overrides] = await this.handler[this.command_name](this.context, this);
                if (err) {
                    return await this._reply(err, overrides);
                }
                if (response instanceof String || typeof response === 'string') {
                    return await this._reply(response, overrides);
                }
                if (response instanceof Object) {
                    return await this._replyWithMedia(response, overrides);
                }
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
        return await this._redis.hgetall(key);
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
        await this._redis.hmset(key, data);
    }

    async redisGetList() {
        if (!this._redis) {
            throw new Error('Storage is offline');
        }
        let key = `${this.context.chat?.id || this.context.from.id}:get:*`;
        let r_keys = await this._redis.keys(key);
        let keys = [];
        for (let r_key of r_keys) {
            keys.push(r_key.split(':').slice(-1));
        }
        return keys;
    }

    getCurrency(name) {
        return this._currencies_list ? this._currencies_list[name] : null;
    }

    /**
     * Reply to message
     * @param {String} text text to send
     * @return {Message | null}
     */
    async _reply(text, overrides) {
        this.logger.info(`Replying with [${text}]`);
        try {
            return await this.context.reply(text, {
                reply_to_message_id: this.context.message.message_id,
                disable_web_page_preview: overrides ? Boolean(overrides.disable_web_page_preview) : true,
                allow_sending_without_reply: true,
                parse_mode: 'HTML'
            });
        } catch (err) {
            this.logger.error(`Could not send message, got an error: ${err && err.stack}`);
            return this._reply(`Не смог отправить ответ, давай больше так не делать`);
        }
    }

    /**
     * Reply to message with media
     * @param {Object} message may contain text and an id of one of `[animation, audio, document, video, video_note, voice, sticker]`
     * @return {Message | null}
     */
    async _replyWithMedia(message, overrides) {
        if (message.text && message.type === 'text') {
            return this._reply(message.text, overrides);
        }
        let message_options = {
            reply_to_message_id: this.context.message.message_id,
            caption: message.text,
            parse_mode: 'HTML',
            disable_web_page_preview: overrides ? Boolean(overrides.disable_web_page_preview) : true,
            allow_sending_without_reply: true
        };

        let media = message[message.type] instanceof Buffer ? new InputFile(message[message.type], message.filename) : message[message.type];

        let media_type = message.type.split('');
        media_type[0] = media_type[0].toUpperCase();
        media_type = media_type.join('');

        if (typeof this.context['replyWith' + media_type] === 'function') {
            this.logger.info(`Replying with [${message_options.caption ? `${message_options.caption} ` : ''}${media_type}:${message.filename ? message.filename : media}]`);
            return await this.context['replyWith' + media_type](media, message_options);
        }
        this.logger.info(`Can't send what is left of the message ${JSON.stringify(message)}`);
        return (message_options.text || null) && this._reply(message_options.caption);
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
                        parse_mode: 'HTML',
                        disable_web_page_preview: overrides ? Boolean(overrides.disable_web_page_preview) : true,
                    }
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
                let command_text = match.slice(2, -2)
                let command_name = command_text.match(command_name_regex)[0].slice(1);
                if (this.client.inline_commands.includes(command_name) && typeof this.handler[command_name] === 'function') {
                    let input = Object.assign({ message: { text: command_text } }, parsed_context)
                    try {
                        const [err, response, short, overrides] = await this.handler[command_name](input, this);
                        if (err) {
                            query = query.replace(command_text, 'ОШИБКА');
                        }
                        else if (short) {
                            query = query.replace(match, short);
                        }
                        else if (response) {
                            if (response instanceof String || typeof response === 'string') {
                                query = query.replace(match, response);
                            }
                            else if (response.type === 'text') {
                                let answer = {
                                    id: Date.now(),
                                    type: 'article',
                                    title: command_text,
                                    description: response.text,
                                    parse_mode: 'HTML',
                                    input_message_content: {
                                        message_text: response.text,
                                        parse_mode: 'HTML',
                                        disable_web_page_preview: overrides ? Boolean(overrides.disable_web_page_preview) : true
                                    }
                                }
                                query_result.results.push(answer);
                            }
                            else if (['animation', 'audio', 'document', 'video', 'voice', 'photo', 'gif', 'sticker'].includes(response.type)) {
                                query = query.replace(match, '');
                                let suffix = response.url ? '_url' : '_file_id';
                                let data = response.url ? response.url : response[response.type];
                                let answer = {
                                    id: Date.now(),
                                    type: response.type === 'animation' ? 'gif' : response.type,
                                    title: response.text ? response.text : clean_query,
                                    caption: response.text ? response.text : clean_query,
                                    parse_mode: 'HTML'
                                };
                                answer[`${response.type === 'animation' ? 'gif' : response.type}${suffix}`] = data;
                                if (response.url) {
                                    answer['thumb_url'] = response.type !== 'video' ? response.url : config.VIDEO_THUMB_URL;
                                }
                                if (!answer.title) {
                                    answer.title = ' ';
                                }
                                this.logger.info(`Pushing answer [${JSON.stringify(answer)}]`);
                                query_result.results.push(answer);
                            }
                        }
                    }
                    catch (err) {
                        this.logger.error(`Error while processing command [${command_text}] from inline query[${this.context.inlineQuery.query}]: ${err && err.stack}`);
                        query = query.replace(command_text, 'ОШИБКА');
                    }
                }
            }

            if (query_result.results.length) {
                return await this._answerQueryWithArray(query_result);
            }

            return await this._answerQueryWithText(query);
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
        this.cooldown_map = {};
        this.cooldown_duration = 5 * 1000;
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

        this.client.command('start', async (ctx) => new TelegramInteraction(this, 'start', ctx).respond());
        this.client.command('help', async (ctx) => new TelegramInteraction(this, 'help', ctx).respond());
        this.client.command('calc', async (ctx) => new TelegramInteraction(this, 'calc', ctx).respond());
        this.client.command('discord_notification', async (ctx) => new TelegramInteraction(this, 'discord_notification', ctx).respond());
        this.client.command('ping', async (ctx) => new TelegramInteraction(this, 'ping', ctx).respond());
        this.client.command('html', async (ctx) => new TelegramInteraction(this, 'html', ctx).respond());
        this.client.command('fizzbuzz', async (ctx) => new TelegramInteraction(this, 'fizzbuzz', ctx).respond());
        this.client.command('gh', async (ctx) => new TelegramInteraction(this, 'gh', ctx).respond());
        this.client.command('curl', async (ctx) => new TelegramInteraction(this, 'curl', ctx).respond());

        if (this.app && this.app.redis) {
            this.inline_commands = this.inline_commands.concat(['get', 'get_list']);
            this.client.command('set', async (ctx) => new TelegramInteraction(this, 'set', ctx).respond());
            this.client.command('get', async (ctx) => new TelegramInteraction(this, 'get', ctx).respond());
            this.client.command('get_list', async (ctx) => new TelegramInteraction(this, 'get_list', ctx).respond());
        }

        if (config.URBAN_API) {
            this.inline_commands.push('urban');
            this.client.command('urban', async (ctx) => new TelegramInteraction(this, 'urban', ctx).respond());
        }

        if (config.AHEGAO_API) {
            this.inline_commands.push('ahegao');
            this.client.command('ahegao', async (ctx) => new TelegramInteraction(this, 'ahegao', ctx).respond());
        }

        if(config.DEEP_AI_API) {
            this.inline_commands.push('deep');
            this.client.command('deep', async (ctx) => new TelegramInteraction(this, 'deep', ctx).respond());
        }

        if (config.WIKIPEDIA_SEARCH_URL) {
            this.inline_commands.push('wiki');
            this.client.command('wiki', async (ctx) => new TelegramInteraction(this, 'wiki', ctx).respond());
        }

        if (process.env.COINMARKETCAP_TOKEN && config.COINMARKETCAP_API) {
            this.inline_commands.push('cur');
            this.client.command('cur', async (ctx) => new TelegramInteraction(this, 'cur', ctx).respond());
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
            let timestamp = Date.now();
            this.client.api.setWebhook(`${config.DOMAIN}/telegram-${timestamp}`).then(() => {
                this.logger.info('Telegram webhook is set.');
                this.health = 'set';
                this.app.api_server.setWebhookMiddleware(`/telegram-${timestamp}`, webhookCallback(this.client));
            }).catch(err => {
                this.logger.error(`Error while setting telegram webhook: ${err && err.stack}`);
                this.logger.info('Trying to start with polling');
                this._startPolling();
            });
        }
    }

    async stop() {
        if (!process.env.TELEGRAM_TOKEN) {
            return;
        }
        this.logger.info('Gracefully shutdowning Telegram client.');
        this.client.api.setWebhook();
        this.client.stop();
    }

    _startPolling() {
        if (!process.env.TELEGRAM_TOKEN) {
            this.logger.warn(`Token for Telegram wasn't specified, client is not started.`);
            return;
        }
        this.client.start().then(() => {
            this.health = 'ready';
        }).catch(err => {
            this.logger.error(`Error while starting Telegram client: ${err && err.stack}`);
            this.health = 'off';
        });
    }

    async sendNotification(notification_data, chat_id) {
        if (!notification_data || !chat_id || !this.client) return;
        for (let diff of notification_data['+']) {
            new TelegramInteraction(this).sendNotification({ ...diff, ...notification_data.channel }, chat_id);
        }
        for (let diff of notification_data['-']) {
            new TelegramInteraction(this).sendNotification({ ...diff, ...notification_data.channel }, chat_id);
        }
    }
}

module.exports = TelegramClient;
