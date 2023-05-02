const { Bot, Context, webhookCallback, InputFile } = require('grammy');
const TelegramHandler = require('./telegram-handler');
const config = require('../config.json');
const { setHealth } = require('../services/health');
const { handleCommand, getLegacyResponse } = require('./common-interface');
const { commands, conditions, definitions, handlers } = require('../commands/handlers-exporter');
const { ChatGPTHandler } = require('./gpt-handler');
const { isNotificationMessage } = require('./channel-subscriber.js');

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
            telegram_message_id: context?.message?.message_id,
            telegram_user_id: context?.from?.id,
            telegram_placeholder_message_id: this?._placeholderMessage?.message_id,
        };
        this.logger = require('../logger').child(this.log_meta);
        this.command_name = command_name;
        this.context = context;
        this.handler = client.handler;
        this._redis = client.redis;
        this._currencies_list = client.currencies_list;

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
            };
        }
    }

    get inline_commands() {
        return this.client.inline_commands;
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
            parsed_media.media = message[parsed_media.type].file_id;
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
        this.logger.info(`Replying with text`);
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

        this.logger.info(`Replying with media group of type: ${message.type}`, { response: media });
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

        let media;

        if (message.filename) {
            this.logger.info(`Replying with file of type: ${message.type}`);
            media = new InputFile(message.media, message.filename);
        }
        else {
            this.logger.info(`Replying with media of type: ${message.type}`);
            media = message.media || message[message.type];
        }

        const replyMethod = this._getReplyMethod(message.type);

        if (typeof replyMethod === 'function') {
            return replyMethod(media, message_options);
        }

        this.logger.info(`Can't send message as media`);
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
                this.logger.error(`Error while sending placeholder message [text: ${placeholder_text}] in reply to [message_id: ${this.context.message.message_id}] in [chat: ${this.context.chat.id}]`, { error: err.stack || err })
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
            this.logger.error(`Error while deleting placeholder message [message_id: ${this._placeholderMessage.message_id}] in [chat: ${this._placeholderMessage.chat.id}]`, { error: err.stack || err })
        );
    }

    /**
     * High level function for replying to Telegram-specific commands
     * Returns undefined or promise for reply request
     * @returns {undefined | Promise}
     */
    reply() {
        if (typeof this.handler[this.command_name] !== 'function') {
            this.logger.warn(`Received nonsense, how did it get here???`);
            return;
        }

        this.logger.info(`Received command: ${this.command_name}`);

        this.handler[this.command_name](this.context, this).then(([err, response, _, overrides]) => {
            if (err) {
                return this._reply(err, overrides).then(this.deletePlaceholder.bind(this)).catch((err) => {
                    this.logger.error(`Error while replying with an error message to [${this.command_name}]`, { error: err.stack || err });
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply failed`, { error: err.stack || err }));
                });
            }
            if (response instanceof String || typeof response === 'string') {
                return this._reply(response, overrides).then(this.deletePlaceholder.bind(this)).catch((err) => {
                    this.logger.error(`Error while replying with response text to [${this.command_name}]`);
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply failed`, { error: err.stack || err }));
                });
            }
            if (response instanceof Object) {
                return this._replyWithMedia(response, overrides).then(this.deletePlaceholder.bind(this)).catch((err) => {
                    this.logger.error(`Error while replying with media to [${this.command_name}]`);
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply failed`, { error: err.stack || err }));
                });
            }
        }).catch((err) => {
            this.logger.error(`Error while processing command [${this.command_name}]`, { error: err.stack || err });
            this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply dropped`, { error: err.stack || err }));
        });
    }

    /**
     * Generate inline query result from text ("article")
     * @param {String} text 
     * @param {Object} overrides 
     * @returns {Object}
     */
    _generateInlineText(text, overrides) {
        let result = {
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
        };

        return result;
    }

    /**
     * Generate inline query result from media
     * @param {Object} media 
     * @param {Object?} overrides 
     * @returns {Object}
     */
    _generateInlineMedia(media, overrides) {
        if (media.type === 'text') return this._generateInlineText(media.text, overrides);

        if (!inline_answer_media_types.includes(media.type)) {
            this.logger.warn(`Can't answer inline query with media of type: ${media.type}`);
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

        for (let key in result) {
            if (!result[key]) {
                delete result[key];
            }
        }

        if (!result.title) {
            result.title = ' ';
        }

        return result;
    }

    /**
     * Asnweres inline query accroding to passed results
     * @param {Object[]} results_array 
     * @param {Object?} overrides 
     * @returns {undefined | Promise}
     */
    async _answerQuery(results_array, overrides) {
        if (!results_array) {
            return;
        }

        const answer = {
            results: results_array,
            other: {
                cache_time: 0,
                ...overrides
            }
        }

        if (process.env.WEBAPP_URL) {
            answer.other = {
                ...answer.other,
                button: {
                    text: 'Открыть веб-интерфейс',
                    web_app: {
                        url: process.env.WEBAPP_URL
                    }
                },
                ...overrides
            }
        }

        this.logger.info(`Responding to inline query with an array`);

        return this.context.answerInlineQuery(answer.results, answer.other);
    }

    /**
     * High level command for answering inline query
     * Returns nothing or the promise for answerInlineQuery
     * @returns {undefined | Promise}
     */
    async answer() {
        this.logger.debug(`Received inline query [${this.context.inlineQuery.query}]`);

        // fist stage, getting command mathes
        const query = this.context.inlineQuery.query;
        const first_word = ((a) => a.length ? a[0] : '/')(query.split(' '));
        const matching_command_names = this.inline_commands.filter((command_name) => `/${command_name}`.startsWith(first_word));
        const command_name = first_word.slice(1);
        this.logger.silly(`List of matching commands: [${JSON.stringify(matching_command_names)}] for first word ${first_word}`);

        // if multiple commands are matching, answer with help
        if (matching_command_names.length > 0 && !this.inline_commands.includes(command_name)) {
            let results = [];
            for (const matching_command_name of matching_command_names) {
                if (commands.includes(matching_command_name)) {
                    const index = commands.indexOf(matching_command_name);
                    let line = `/${matching_command_name} `;
                    if (definitions[index].args && definitions[index].args.length) {
                        for (const arg of definitions[index].args) {
                            line += `{${arg.name}${arg.optional ? '?' : ''}} `;
                        }
                    }
                    results.push(
                        this._generateInlineText(
                            line,
                            {
                                description: definitions[index].description,
                                id: `${matching_command_name}${require('../package.json').version}${process.env.ENV}`,
                                message_text: `<code>@${this.context.me.username} ${line}</code>\n<i>${definitions[index].description}</i>`,
                            }
                        )
                    );
                }
            }

            if (!results.length) {
                this.logger.silly(`No help is generated for the inline query, exiting`);
                return;
            }

            return this._answerQuery(results).catch((err) => {
                this.logger.error(`Error while answering the inline query`, { error: err.stack || err });
            });
        }

        // nothing matches, exit
        if (!matching_command_names.length || !this.inline_commands.includes(command_name)) {
            this.logger.silly(`Inline query doesn't match any command, sending empty answer`);
            return this._answerQuery([], { cache_time: 0 }).catch(err => {
                this.logger.error(`Error while sending empty response for inline query`, { error: err.stack || err });
            });
        }


        // second stage, when this is a command
        let parsed_context = {
            chat: {
                id: this.context.inlineQuery.from.id
            },
            from: this.context.inlineQuery.from,
            message: {
                text: query
            },
            type: 'private'
        };

        this.logger.info(`Received eligible inline query, parsed context [${JSON.stringify(parsed_context)}]`);

        (async () => {
            if (this.handler[command_name]) {
                return this.handler[command_name](parsed_context, this);
            }
            const common_command_index = commands.indexOf(command_name);
            if (common_command_index >= 0) {
                return getLegacyResponse(parsed_context, handlers[common_command_index], definitions[common_command_index]);
            }
        })().then(([err, response, _, overrides]) => {
            if (err) {
                this.logger.debug(`Handler for [${command_name}] from inline query responded with error`, { error: err.stack || err });
                return;
            }
            if (response) {
                try {
                    if (response instanceof String || typeof response === 'string') {
                        return this._answerQuery([this._generateInlineText(
                            response,
                            overrides
                        )]).catch(err =>
                            this.logger.error(`Error while responsing to inline query with text`, { error: err.stack || err })
                        );
                    }
                    if (response instanceof Object) {
                        return this._answerQuery([this._generateInlineMedia(
                            response,
                            overrides
                        )]).catch(err =>
                            this.logger.error(`Error while responding to inline query with media`, { error: err.stack || err })
                        );
                    }
                }
                catch (err) {
                    this.logger.error(`Error when generating inline query`, { error: err.stack || err });
                }
            }
        }).catch(err => {
            this.logger.error(`Error while processing inline query`, { error: err.stack || err });
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

    /**
     * 
     * @param {String} command_name command name
     * @param {* | Function?} condition {true} condition on which to register command or function that returns this condition
     * @param {Boolean?} is_inline {false} if command should be available for inline querying
     * @param {String?} handle_function_name {command_name} which function from TelegramHandler handles this command
     */
    _registerTelegramCommand(command_name, condition = false, is_inline = false, handle_function_name = command_name) {
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
                    this.logger.error(`Error while deleting service [message: ${ctx.message.message_id}] in [chat: ${ctx.chat.id}] `, { error: err.stack || err });
                });
            }
        });
    }

    _registerCommands() {
        // Registering commands specific to Telegram
        this._registerTelegramCommand('start', true);
        this._registerTelegramCommand('help', true, true);
        this._registerTelegramCommand('html', true, true);
        this._registerTelegramCommand('fizzbuzz', true, true);
        this._registerTelegramCommand('gh', true, true);
        this._registerTelegramCommand('set', this.app && this.app.redis);
        this._registerTelegramCommand('get', this.app && this.app.redis, true);
        this._registerTelegramCommand('get_list', this.app && this.app.redis, true);
        this._registerTelegramCommand('del', this.app && this.app.redis);
        this._registerTelegramCommand('deep', config.DEEP_AI_API && process.env.DEEP_AI_TOKEN);
        this._registerTelegramCommand('info', true);
        // this._registerTelegramCommand('ytdl', process.env.YTDL_URL, false);
        
        // Registering common commands
        commands.forEach((command_name, index) => {
            if (typeof conditions[index] === 'function') {
                if (!conditions[index]()) {
                    return;
                }
            }
            else if (!conditions[index]) {
                return;
            }

            this.client.command(command_name, async (ctx) => handleCommand(ctx, handlers[index], definitions[index]));

            if (definitions[index].is_inline) {
                this.inline_commands.push(command_name);
            }
        });

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
                setHealth('telegram', 'ready');
            }
        }).then(() => {
            this.logger.info('Long polling has ended');
            setHealth('telegram', 'off');
        }).catch(err => {
            this.logger.error(`Error while starting Telegram client`, { error: err.stack || err });
            setHealth('telegram', 'off');
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
                setHealth('telegram', 'set');
                this.app.api_server.setWebhookMiddleware(`/${webhookUrl.split('/').slice(-1)[0]}`, webhookCallback(this.client, 'express'));
            }
        }
        catch (err) {
            this.logger.error(`Error while setting telegram webhook`, { error: err.stack || err });
            this.logger.info('Trying to start with polling');
            this._startPolling();
        };
    }

    _registerGPTAnswers() {
        if (!process.env.OPENAI_TOKEN) {
            return;
        }

        this.chatgpt_handler = new ChatGPTHandler();

        this.client.command('tree', async (ctx) => {
            this.chatgpt_handler.handleTreeRequest(new TelegramInteraction(this.client, 'tree', ctx));
        });

        this.client.command('answer', async (ctx) => {
            if (ctx?.message?.reply_to_message && !isNotificationMessage(ctx?.message?.reply_to_message?.id)) {
                this.chatgpt_handler.handleAnswerCommand(new TelegramInteraction(this.client, 'answer', ctx));
            }
        });

        /* Sesitive data
        * this.client.command('context', async (ctx) => {
        *     if (ctx?.message?.reply_to_message) {
        *         this.chatgpt_handler.handleContextRequest(new TelegramInteraction(this.client, 'context', ctx));
        *     }
        * });
        */

        this.client.command('new_system_prompt', async (ctx) => {
            this.chatgpt_handler.handleAdjustSystemPrompt(new TelegramInteraction(this.client, 'new_system_prompt', ctx));
        });

        this.client.on('message', async (ctx) => {
            if (!ctx?.from?.is_bot && ctx?.message?.reply_to_message?.from?.id === this.client.botInfo.id) {
                this.chatgpt_handler.answerReply(new TelegramInteraction(this.client, null, ctx));
            }
            else if (ctx.chat.id === ctx.from.id) {
                this.chatgpt_handler.answerQuestion(new TelegramInteraction(this.client, null, ctx));
            }
        });

    }

    async start() {
        if (!process.env.TELEGRAM_TOKEN) {
            this.logger.warn(`Token for Telegram wasn't specified, client is not started.`);
            return;
        }

        if (process.env?.ENV === 'test') {
            this.client = new Bot(process.env.TELEGRAM_TOKEN, {
                client: {
                    buildUrl: (root, token, method) => `https://api.telegram.org/bot${token}/test/${method}`
                }
            });
        }
        else {
            this.client = new Bot(process.env.TELEGRAM_TOKEN);
        }

        this.client.catch((err) => {
            this.logger.error(`High level middleware error in bot`, { error: err.stack || err });
        });

        this._registerCommands();
        this._filterServiceMessages();
        this._registerGPTAnswers();

        if (['dev', 'test'].includes(process.env.ENV.toLowerCase()) || !process.env.PORT || !process.env.DOMAIN) {
            this._startPolling();
        }
        else {
            this._setWebhook();
        }
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
        setHealth('telegram', 'off');
    }
}

module.exports = TelegramClient;
