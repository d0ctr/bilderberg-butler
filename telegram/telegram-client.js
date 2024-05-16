const { Bot, Context, webhookCallback, InputFile } = require('grammy');
const { promises: fs } = require('fs');
const { hydrateFiles } = require('@grammyjs/files');
const TelegramHandlers = require('./telegram-handler');
const config = require('../config.json');
const { setHealth } = require('../services/health');
const { handleCommand, getLegacyResponse, handleCallback } = require('../commands/telegram');
const { commands, conditions, definitions, handlers, callbacks } = require('../commands/handlers-exporter');
const ChatLLMHandler = require('./llm-handler.js');
const { isNotificationMessage: isChannelNotificationMessage } = require('./channel-subscriber.js');
const { isNotificationMessage: isEventNotificationMessage } = require('./event-subscriber.js');
const { used: tinkovUsed } = require('./command-handlers/tinkov-handler.js');
const { to, convertMD2Nodes } = require('../utils');

const no_tags_regex = /<\/?[^>]+(>|$)/g;

const CLEAR_ERROR_MESSAGE_TIMEOUT = ++process.env.CLEAR_ERROR_MESSAGE_TIMEOUT || 10000;

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
    'sticker',
    'mpeg4_gif'
];

const inline_media_requiring_thumbnail = [
    'photo',
    'video',
    'gif',
    'animation',
    'mpeg4_gif'
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
        };
        this.logger = require('../logger').child(this.log_meta);
        this.command_name = command_name;
        this.context = context;
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
     * @returns {Map<'string', 'string'[]>}
     */
    get registered_commands() {
        return this.client.registered_commands;
    }

    /**
     * @returns {Telegram}
     */
    get api() {
        return this.client.client.api;
    }

    /**
     * 
     * @param {import('grammy/types').Message} message 
     */
    getWithEntities(message, goodEntities) {
        let original = message?.text || message?.caption || null;
        if (!original?.length) return null;
        let text = '';

        let cursor = 0;
        let entities = goodEntities.sort((a, b) => a.offset - b.offset || b.length - a.length);
        for (const entity of entities) {
            if (cursor < entity.offset) {
                text += original.slice(cursor, entity.offset);
            }
            text += to[entity.type](original.slice(entity.offset, entity.offset + entity.length), 'html', entity);
            cursor = entity.offset + entity.length;
        }

        if (cursor < entities.slice(-1).offset) {
            text += original.slice(entity.offset + entity.length);
        }
        return text;
    }

    /**
     * 
     * @param {import('grammy/types').Message} message 
     * @returns 
     */
    _parseMessageMedia(message) {
        if (!message) return;

        const parsed_media = {};

        parsed_media.text = message.text || message.caption;
        
        let goodEntities = (message?.entities || message?.caption_entities || [])?.filter(e => [
            'bold', 'italic', 'underline', 'strikethrough', 'spoiler', 
            'blockquote', 'code', 'pre', 'text_link'
        ].includes(e.type));

        if (goodEntities.length) {
            parsed_media.text = this.getWithEntities(message, goodEntities);
        }

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
            reply_parameters: {
                message_id: this.context.message?.reply_to_message?.message_id || this.context.message?.message_id,
                allow_sending_without_reply: true
            }
        };
    }

    _getTextOptions() {
        return {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true }
        };
    }

    /**
     * Get reply method associated with content type
     * @param {String} media_type 
     * @return {() => Promise}
     */
    _getReplyMethod(media_type) {
        return this.mediaToMethod[media_type];
    }

    /**
     * Reply to message with text
     * @param {String} text text to send
     * @return {Promise<Message>}
     */
    async _reply(text, overrides) {
        this.logger.info(`Replying with text`);
        return this.context.reply(text, {
            ...this._getBasicMessageOptions(),
            ...this._getTextOptions(),
            ...overrides,
            original: undefined
        });
    }

    /**
     * Reply to message with media group
     * 
     * @param {Object} message contains media group 
     * @param {Object | null} overrides 
     * @returns {Promise<Message>}
     */
    async _replyWithMediaGroup(message, overrides) {
        if (message.type === 'text') {
            return this._reply(message.text, overrides)
        }

        const message_options = {
            ...this._getBasicMessageOptions(),
            ...overrides,
            original: undefined
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
            ...overrides,
            original: undefined
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
            ...overrides,
            ...message.overrides,
            original: undefined
        };

        let media;

        if (message.filename || message.path) {
            this.logger.info(`Replying with file of type: ${message.type}`);
            media = new InputFile(message.media || message.path, message.filename);
        }
        else {
            this.logger.info(`Replying with media of type: ${message.type}`);
            media = message.media || message[message.type];
        }

        const replyMethod = this._getReplyMethod(message.type);

        const deleteTempFile = () => {
            if (!message.path) return;
            return fs.rm(message.path).then(() => {
                this.logger.debug('Deleted temp file');
            }).catch((e) => {
                this.logger.error(`Could not delete temp file: ${message.path}`, { error: e.stack || e });
            });
        }

        if (typeof replyMethod === 'function') {
            return replyMethod(media, message_options).finally(deleteTempFile);
        }

        deleteTempFile();

        this.logger.info(`Can't send message as media`);
        return this._reply(message.text);
    }

    /**
     * Reply with link to Telegra.ph article
     * @param {string} text 
     * @param {{original?: {text: string, parse_mode?: 'html' | 'markdown'} }} overrides
     * @param {'html' | 'markdown'} parse_mode
     */
    async _replyWithArticle(_text, overrides, _parse_mode = 'html') {
        if (process.env.TELEGRAPH_TOKEN == null) {
            throw 'Too long text';
        }

        const { Telegraph, parseHtml } = await import('better-telegraph');
        const telegraph = new Telegraph({ accessToken: process.env.TELEGRAPH_TOKEN });
        const parse_mode = overrides.original?.parse_mode || _parse_mode;
        let text = overrides.original?.text || _text;
        if (parse_mode === 'html') {
            text = text.replace('<pre><code', '<code').replace('</code></pre>', '</code>');
        }

        const content = parse_mode !== 'html'
            ? convertMD2Nodes(text)
            : parseHtml(text);
        
        let title = 'Bilderberg Butler';
        if (typeof content === 'string') {
            title = content;
        }
        else if (['h3', 'h4', 'p'].includes(content[0].tag) && typeof content[0].children[0] === 'string' ) {
            title = content[0].children[0];
        }

        title = title.split(' ').slice(0, 5).join(' ').slice(0, 256);

        try {
            const { url } = await telegraph.create({
                title,
                content,
                author_name: this.client.client.botInfo.first_name,
                author_url: `https://t.me/${this.client.client.botInfo.username}`,
            });

            return this._reply(url, { 
                link_preview_options: { is_disabled: false }
            });
        }
        catch (err) {
            this.logger.error('Failed to create an article', { error: err.stack || err });
            return null;
        }
    }

    /**
     * High level function for replying to Telegram-specific commands
     * Returns undefined or promise for reply request
     */
    reply() {
        if (typeof TelegramHandlers[this.command_name]?.handler !== 'function') {
            this.logger.warn(`Received nonsense, how did it get here???`);
            return;
        }

        this.logger.info(`Received command: ${this.command_name}`);

        TelegramHandlers[this.command_name].handler(this.context, this).then(([err, response, callback, overrides]) => {
            if (!callback) callback = () => {};
            if (err) {
                return this._reply(err, overrides).catch((err) => {
                    this.logger.error(`Error while replying with an error message to [${this.command_name}]`, { error: err.stack || err });
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply failed`, { error: err.stack || err }));
                }).then((response_message) => {
                    if (CLEAR_ERROR_MESSAGE_TIMEOUT > 0) {
                        setTimeout(() => {
                            // clear request message if only command is there
                            if ((this.context.message.text || this.context.message.caption)?.split(' ')?.length === 1) {
                                this.context.deleteMessage().catch(() => {});   
                            }
                            this.context.api.deleteMessage(response_message.chat.id, response_message.message_id).catch(() => {});
                        }, CLEAR_ERROR_MESSAGE_TIMEOUT);
                    }
                }).then(callback);
            }
            else if (response instanceof String || typeof response === 'string') {
                return this._reply(response, overrides).catch(err => {
                    if (!err?.description?.includes('message is too long')) throw err;
                    return this._replyWithArticle(overrides.original?.text || response);
                }).catch(err => {
                    this.logger.error(`Error while replying with response text to [${this.command_name}]`);
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply failed`, { error: err.stack || err }));
                }).then(callback);
            }
            else if (Array.isArray(response)) {
                return this._replyWithMedia(response[0], overrides).catch(err => {
                    this.logger.error(`Error while replying with single media from an array to [${this.command_name}]`);
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply failed`, { error: err.stack || err }));
                })
            }
            else if (response instanceof Object) {
                return this._replyWithMedia(response, overrides).catch(err => {
                    this.logger.error(`Error while replying with media to [${this.command_name}]`);
                    this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply failed`, { error: err.stack || err }));
                }).then(callback);
            }
        }).catch((err) => {
            this.logger.error(`Error while processing command [${this.command_name}]`, { error: err.stack || err });
            this._reply(`Что-то случилось:\n<code>${err}</code>`).catch((err) => this.logger.error(`Safe reply failed`, { error: err.stack || err }));
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
                original: undefined
            },
            ...this._getTextOptions(),
            ...overrides,
            original: undefined
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
        let thumbnail_url = media.thumbnail_url || (inline_media_requiring_thumbnail.includes(media.type) && config.DEFAULT_THUMBNAIL_URL);
        let result = {
            id: Date.now(),
            type: inline_type,
            title: media.text ? media.text.split('\n')[0] : ' ',
            caption: media.text,
            thumbnail_url,
            ...this._getTextOptions(),
            ...overrides,
            ...media.overrides,
            original: undefined
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
                ...overrides,
                original: undefined
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
                this.registered_commands.forEach((help, command_name) => {
                    if (command_name !== matching_command_name || !help.length) return;
                    let line = `/${command_name} ${help.length > 1 ? help.slice(0, -1).join(' ') : ''}`;
                    results.push(
                        this._generateInlineText(
                            line,
                            {
                                description: help.slice(-1)[0],
                                id: `${matching_command_name}${require('../package.json').version}${process.env.ENV}`,
                                message_text: `<code>@${this.context.me.username} ${line}</code>\n<i>${help.slice(-1)[0]}</i>`,
                            }
                        )
                    );
                });
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

        this.logger.info(`Received eligible inline query, will call handler`);

        (async () => {
            if (TelegramHandlers[command_name]?.handler) {
                return TelegramHandlers[command_name].handler(parsed_context, this);
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
                    else if (Array.isArray(response)) {
                        return this._answerQuery(response.map(r => this._generateInlineMedia(r, overrides))).catch(err => 
                            this.logger.error('Error while responding to inline query with array', { error: err.stack || err })
                        );
                    }
                    else if (response instanceof Object) {
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
        this.inline_commands = [];
        this.registered_commands = new Map();
        this.callbacks = {};
    }

    /**
     * 
     * @param {String} command_name command name
     * @param {* | Function?} condition {false} condition on which to register command or function that returns this condition
     * @param {Boolean?} is_inline {false} if command should be available for inline querying
     * @param {String?} handle_function_name {command_name} which function from TelegramHandler handles this command
     */
    _registerTelegramCommand(command_name, condition = false, is_inline = false, handle_function_name = command_name) {
        if (typeof condition === 'function') {
            if (!condition()) return;
        }
        else if (!condition)  return;

        TelegramHandlers[handle_function_name]?.help && this.registered_commands.set(command_name, TelegramHandlers[handle_function_name].help);

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
        this._registerTelegramCommand('webapp', process.env.WEBAPP_URL);
        this._registerTelegramCommand('roundit', true);
        this._registerTelegramCommand('new_system_prompt', process.env.OPENAI_TOKEN || process.env.ANTHROPIC_TOKEN);
        this._registerTelegramCommand('answer', process.env.ANTHROPIC_TOKEN);
        // this._registerTelegramCommand('tree', process.env.OPENAI_TOKEN);
        this._registerTelegramCommand('context', process.env.OPENAI_TOKEN || process.env.ANTHROPIC_TOKEN);
        this._registerTelegramCommand('gpt4', process.env.OPENAI_TOKEN);
        this._registerTelegramCommand('opus', process.env.ANTHROPIC_TOKEN);
        this._registerTelegramCommand('vision', process.env.OPENAI_TOKEN);
        this._registerTelegramCommand('tldr', process.env.YA300_TOKEN && config.YA300_API_BASE, true);
        this._registerTelegramCommand('voice', true);
        this._registerTelegramCommand('t', this.app && this.app.redis, true);
        this._registerTelegramCommand('set_sticker');
        
        // Registering common commands
        commands.forEach((command_name, index) => {
            if (typeof conditions[index] === 'function') {
                if (!conditions[index]()) return;
            }
            else if (!conditions[index]) return;

            let args = [];
            if (definitions?.[index]?.args?.length) {
                for (const arg of definitions[index].args) {
                    args.push(`{${arg.name}${arg.optional ? '?' : ''}}`);
                }
            }
            this.registered_commands.set(command_name, [args.join(' '), definitions[index].description]);

            this.client.command(command_name, async (ctx) => handleCommand(ctx, handlers[index], definitions[index]));
            if (definitions[index].is_inline) {
                this.inline_commands.push(command_name);
            }
            if (callbacks[index] != null) {
                this.callbacks[command_name] = callbacks[index];
            }
        });

        this.client.api.setMyCommands(
            [...this.registered_commands.entries()]
                .reduce((acc, [command_name, help]) => {
                    if (help?.length) {
                        acc.push({command: command_name, description: help.join(' ')});
                    }
                    return acc;
                }, []),
            {
                scope: {
                    type: 'default'
                }
            }
        ).catch(err => {
            this.logger.error('Error while registering commands', { error: err.stack || err });
        }).then(registered => {
            if (registered) this.logger.debug('Received successful response for commands registering');
            return this.client.api.getMyCommands({ scope: { type: 'default' } });
        }).catch(err => {
            this.logger.error('Error while getting registered commands', { error: err.stack || err });
        }).then(commands => {
            this.logger.debug(`Received following registered commands: ${JSON.stringify(commands)}`);
        });

        this.client.on('inline_query', async (ctx) => new TelegramInteraction(this, 'inline_query', ctx).answer());

        this.client.on('chosen_inline_result', (ctx) => {
            if (ctx.chosenInlineResult?.result_id?.startsWith('tinkov:')) {
                tinkovUsed(ctx.chosenInlineResult.result_id);
            }
        })
    }

    async _saveInterruptedWebhookURL() {
        try {
            const { url } = await this.client.api.getWebhookInfo();

            if (url) {
                this.logger.info(`Saving interrupted webhook url for restoration [${url}]`);
                this._interruptedWebhookURL = url;
            }
        }
        catch (err) {
            this.logger.error('Got an error, while getting Webhook Info', { error: err.stack || err });
        }
    }

    async _startPolling() {
        if (!process.env.TELEGRAM_TOKEN) {
            this.logger.warn(`Token for Telegram wasn't specified, client is not started.`);
            return;
        }

        await this._saveInterruptedWebhookURL();

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
        }
    }

    _registerGPTAnswers() {
        if (!process.env.ANTHROPIC_TOKEN) {
            return;
        }

        /* Sesitive data
        * this.client.command('context', async (ctx) => {
        *     if (ctx?.message?.reply_to_message) {
        *         this.chatgpt_handler.handleContextRequest(new TelegramInteraction(this.client, 'context', ctx));
        *     }
        * });
        */

        this.client.on('message', async (ctx) => {
            if (ctx?.message?.reply_to_message?.from?.id === this.client.botInfo.id
                && (isChannelNotificationMessage(ctx?.chat?.id, ctx?.message?.reply_to_message?.message_id)
                || isEventNotificationMessage(ctx?.chat?.id, ctx?.message?.reply_to_message?.message_id))
                ) {
                    return;
            }
            if (!ctx?.from?.is_bot && ctx?.message?.reply_to_message?.from?.id === this.client.botInfo.id) {
                ChatLLMHandler.answerReply(new TelegramInteraction(this, null, ctx));
            }
            else if (ctx.chat.id === ctx.from.id) {
                ChatLLMHandler.answerQuestion(new TelegramInteraction(this, null, ctx));
            }
        });

    }

    _registerCallbacks() {
        this.client.on('callback_query:data', async (ctx) => {
            const prefix = ctx.callbackQuery.data.split(':')[0];
            if (this.callbacks[prefix] != null) {
                return handleCallback(ctx, this.callbacks[prefix]);
            }
        });
    }

    async start() {
        if (!process.env.TELEGRAM_TOKEN) {
            this.logger.warn(`Token for Telegram wasn't specified, client is not started.`);
            return;
        }

        this.client = new Bot(process.env.TELEGRAM_TOKEN, {
            client: {
                buildUrl: (root, token, method) => `${root}/bot${token}${process.env?.ENV === 'dev' ? '/test' : ''}/${method}`
            }
        });

        this.client.catch((err) => {
            this.logger.error(`High level middleware error in bot`, { error: err.stack || err });
        });

        // plugins
        this.client.api.config.use(hydrateFiles(process.env.TELEGRAM_TOKEN, {
            buildFileUrl: (root, token, path) => `${root}/file/bot${token}${process.env?.ENV === 'dev' ? '/test' : ''}/${path}`
        }));

        // filters
        this._filterServiceMessages();
        
        // handlers
        this._registerCommands();
        this._registerGPTAnswers();
        this._registerCallbacks();

        if (process.env.ENV?.toLowerCase() === 'dev' || !process.env.PORT || !process.env.DOMAIN) {
            await this._startPolling();
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

        await this.client.api.deleteWebhook();
        await this.client.stop();
        if (this._interruptedWebhookURL) {
            await this._setWebhook(this._interruptedWebhookURL); // restoring interrupted webhook if possible
        }
        setHealth('telegram', 'off');
    }
}

module.exports = {
    TelegramClient,
    TelegramInteraction   
};
