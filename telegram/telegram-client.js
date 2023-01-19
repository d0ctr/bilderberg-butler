const { Bot, Context, webhookCallback, InputFile } = require('grammy');
const TelegramHandler = require('./telegram-handler');
const config = require('../config.json');
const { setHealth } = require('../services/health');
const { handleCommand, getLegacyResponse } = require('./common-interface');
const { commands, conditions, definitions, handlers } = require('../commands/handlers-exporter');

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
            telegram_user_id: context?.from?.id,
            telegram_user: `${context?.from?.first_name}${context?.from?.last_name ? ' ' + context?.from?.last_name : ''}`,
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

        let media;

        if (message.filename) {
            this.logger.info(`Replying with file [${JSON.stringify({ ...message, media: '...' })}]`, { response: { ...message, media: '...' } });
            media = new InputFile(response.media, response.filename);
        }
        else {
            this.logger.info(`Replying with [${JSON.stringify(message)}]`, { response: message });
            media = message.media;
        }

        const replyMethod = this._getReplyMethod(message.type);

        if (typeof replyMethod === 'function') {
            this.logger.info(`Replying with [${message_options.caption ? `${message_options.caption} ` : ''}${message.type}:${message.filename ? message.filename : media}]`, { response: { ...message, media: '...' }, response_options: message_options });
            return replyMethod(media, message_options);
        }

        this.logger.info(`Can't send message as media [${JSON.stringify(message)}]`, { ...message, media: '...' });
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

    reply() {
        if (typeof this.handler[this.command_name] !== 'function') {
            this.logger.warn(`Received nonsense, how did it get here???: ${this.context.message.text}`);
            return;
        }

        this.logger.info(`Received command: ${this.context.message.text}`);

        this.handler[this.command_name](this.context, this).then(([err, response, _, overrides]) => {
            if (err) {
                return this._reply(err, overrides).then(this.deletePlaceholder.bind(this)).catch((err) => {
                    this.logger.error(`Error while replying with an error message to [${this.context?.message?.text}]`, { error: err.stack || err });
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply failed`, { error: err.stack || err }));
                });
            }
            if (response instanceof String || typeof response === 'string') {
                return this._reply(response, overrides).then(this.deletePlaceholder.bind(this)).catch((err) => {
                    this.logger.error(`Error while replying with response text to [${this.context?.message?.text}]`);
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply failed`, { error: err.stack || err }));
                });
            }
            if (response instanceof Object) {
                return this._replyWithMedia(response, overrides).then(this.deletePlaceholder.bind(this)).catch((err) => {
                    this.logger.error(`Error while replying with media to [${this.context?.message?.text}]`);
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply failed`, { error: err.stack || err }));
                });
            }
        }).catch((err) => {
            this.logger.error(`Error while processing command [${this.context.message.text}]`, { error: err.stack || err });
            this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply dropped`, { error: err.stack || err }));
        });
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

    async answer() {
        if (!this.context.inlineQuery.query) {
            return;
        }
        this.logger.debug(`Received inline query [${this.context.inlineQuery.query}]`);
        let input_matches = this.context.inlineQuery.query.match(inline_query_input_regex)
        let command_input = input_matches && input_matches[0];
        if (!command_input) return;

        let command_name = command_input.split(' ')[0].slice(1);
        if (!this.client.inline_commands.includes(command_name)) {
            return;
        }

        let parsed_context = {
            chat: {
                id: this.context.inlineQuery.from.id
            },
            from: this.context.inlineQuery.from,
            message: {
                text: command_input
            },
            type: 'private'
        };

        this.logger.info(`Received eligible inline query with input [${command_input}], parsed context [${JSON.stringify(parsed_context)}]`);

        ;(async () => {
            if (this.handler[command_name]) {
                return this.handler[command_name](parsed_context, this);
            }
            const common_command_index = commands.indexOf(command_name);
            if (common_command_index >= 0) {
                return getLegacyResponse(parsed_context, handlers[common_command_index], definitions[common_command_index]);
            }
        })().then(([err, response, _, overrides]) => {
            if (err) {
                this.logger.error(`Handler for [${command_input}] from inline query responded with error`, { error: err.stack || err });
                return;
            }
            if (response) {
                if (response instanceof String || typeof response === 'string') {
                    return this._answerQueryWithText(
                        response,
                        overrides
                    ).catch(err =>
                        this.logger.error(`Error while responsing to inline query [${command_input}] with text [${response && response.text}]`, { error: err.stack || err })
                    );
                }
                if (response instanceof Object) {
                    return this._answerQueryWithMedia(
                        response,
                        overrides
                    ).catch(err =>
                        this.logger.error(`Error while responding to inline query [${command_input}] with media [${JSON.stringify(response)}]`, { error: err.stack || err })
                    );
                }
            }
        }).catch(err => {
            this.logger.error(`Error while processing command [${command_input}]`, { error: err.stack || err });
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
        this._registerTelegramCommand('discord_notification', true);
        this._registerTelegramCommand('html', true, true);
        this._registerTelegramCommand('fizzbuzz', true, true);
        this._registerTelegramCommand('gh', true, true);
        this._registerTelegramCommand('set', this.app && this.app.redis);
        this._registerTelegramCommand('get', this.app && this.app.redis, true);
        this._registerTelegramCommand('get_list', this.app && this.app.redis, true);
        this._registerTelegramCommand('del', this.app && this.app.redis);
        this._registerTelegramCommand('deep', config.DEEP_AI_API && process.env.DEEP_AI_TOKEN);
        this._registerTelegramCommand('info', true);
        this._registerTelegramCommand('ytdl', process.env.YTDL_URL, false);
        
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

    async start() {
        if (!process.env.TELEGRAM_TOKEN) {
            this.logger.warn(`Token for Telegram wasn't specified, client is not started.`);
            return;
        }

        this.client = new Bot(process.env.TELEGRAM_TOKEN);

        this.client.catch((err) => {
            this.logger.error(`High level middleware error in bot`, { error: err.stack || err });
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
