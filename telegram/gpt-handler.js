const { OpenAIApi, Configuration } = require('openai');

// const { Converter: MDConverter } = require('showdown');

// const mdConverter = new MDConverter({
//     noHeaderId: 'true',
//     strikethrough: 'true'
// });

/**
 * @typedef {'gpt-3.5-turbo-16k' | 'gpt-4' | 'gpt-4-32k'} Model
 */

/**
 * @type {Model[]}
 */
const models = [
    'gpt-3.5-turbo-16k',
    'gpt-4',
    'gpt-4-32k',
];

/** 
 * @type {Model}
 */
const CHAT_MODEL_NAME = models.includes(process.env.GPT_MODEL) ? process.env.GPT_MODEL : 'gpt-3.5-turbo-16k';

const DEFAULT_SYSTEM_PROMPT = `you are a chat-assistant\nanswer should not exceed 4000 characters`;
/**
   @param {string} input
   @return {string}
 */
function prepareText(input) {
    /** Needs to avoid replacing inside code snippets */
    let res = input
        .replace(/&/gm, '&amp;')
        .replace(/>/gm, '&gt;')
        .replace(/</gm, '&lt;');

    // Replace code blocks with language specification
    res = res.replace(/```(\S*)\n([^]*?)\n```/g, `<pre><code class='$1'>$2</code></pre>`);

    // Replace inline code blocks
    res = res.replace(/`([^`]*?)`/g, '<code>$1</code>');
    /** too aggressive
     *  let res = mdConverter
     *     .makeHtml(input)
     *     .replace(/<\/?p>/gm, '');
     */
    return res;
}

class ContextNode {
    /**
     * @param {{
     *  role: string,
     *  content: string,
     *  message_id: string,
     *  prev_node: ContextNode | null,
     *  name: string | null,
     *  model: Model | null
     * }} 
     */
    constructor({ role, content, message_id, prev_node = null, name = null, model = null } = {}) {
        this.role = role;
        this.content = content;
        this.message_id = message_id;
        this.prev_node = prev_node;
        this.name = name?.replace(/ +/g, '_')?.replace(/[^a-zA-Z0-9_]/g, '')?.slice(0, 64);
        this.model = model;
    }

    /**
     * @typedef {{
     *  role: string,
     *  content: string,
     *  name: string | null,
     * }} NodeMessage
     */

    /**
     * Get nodes data applicable as context
     * @returns {NodeMessage}
     */
    getMessage() {
        const message = {
            role: this.role,
            content: this.content,
        };
        if (this.name) message.name = this.name;
        return message;
    }

    /**
     * @typedef {{
     *  role: string,
     *  content: string,
     *  name: string,
     *  message_id: string,
     *  prev_message_id: string | null,
     *  model: Model | null,
     *  name: string | null,
     * }} NodeRawData
     */

    /**
     * Get raw data of the node
     * @returns {NodeRawData}
     */
    getRawData() {
        const data = {
            role: this.role,
            content: this.content,
            message_id: this.message_id,
        };
        if (this.prev_node) data.prev_message_id = this.prev_node.message_id;
        if (this.model) data.model = this.model;
        if (this.name) data.name =  this.name;
        return data;
    }
}

class ContextTree {
    /**
     * 
     * @param {string | null} system_prompt 
     * @param {Model | null} model 
     */
    constructor(system_prompt, model) {
        this.nodes = new Map();
        this.root_node = new ContextNode({
            role: 'system',
            content: system_prompt || DEFAULT_SYSTEM_PROMPT,
            model: model || CHAT_MODEL_NAME
        });
    }

    /**
     * Get Node by message_id
     * @param {string} message_id 
     * @returns {ContextNode | null}
     */
    getNode(message_id) {
        return this.nodes.has(message_id) ? this.nodes.get(message_id) : null;
    }

    /**
     * Creates new node and appends to the tree either by the prev_message_id or to the root node
     * @param {{ role: string, message_id: string, prev_message_id: string, name: string }}
     */
    appendNode({ role, content, message_id, prev_message_id, name } = {}) {
        let prev_node = this.root_node;

        if (prev_message_id && this.isNodeExisting({ message_id: prev_message_id })) {
            prev_node = this.nodes.get(prev_message_id);
        }

        this.nodes.set(message_id, new ContextNode({ role, content, message_id, prev_node, name }));
    }

    /**
     * Checks if node exists either by node's message_id or provided message_id
     * @param {{ node: ContextNode | null, message_id: string | null }} 
     * @returns 
     */
    isNodeExisting({ node = null, message_id = null } = {}) {
        if (node) {
            message_id = node.message_id;
        }

        return this.nodes.has(message_id);
    }

    /**
     * Gets the context of the message as an array
     * @param {string} message_id 
     * @param {number} limit 
     * @returns {NodeMessage[]}
     */
    getContext(message_id, limit = 30) {
        if (!this.isNodeExisting({ message_id })) {
            return [this.root_node.getMessage()]
        }

        let context = [];

        let last_node = this.getNode(message_id);

        while (last_node && context.length <= limit) {
            context.unshift(last_node.getMessage());
            last_node = last_node.prev_node;
        }

        if (context.length === limit && context[0].role !== this.root_node.role) {
            context.unshift(this.root_node.getMessage());
        }

        return context;
    }


    /**
     * Gets the raw context of the message as an array
     * @param {string | null} message_id 
     * @returns {NodeRawData[]}
     */
    getRawContext(message_id = null) {
        const raw_context = [];

        if (!this.isNodeExisting({ message_id })) {
            return raw_context;
        }

        let last_node = this.getNode(message_id);

        while (last_node) {
            raw_context.unshift(last_node.getRawData());
            last_node = last_node.prev_node;
        }

        return raw_context;
    }
}

class ChatGPTHandler{
    constructor() {
        this.logger = require('../logger').child({ module: 'chatgpt-handler' })
        
        const api_configuration = new Configuration({
            apiKey: process.env.OPENAI_TOKEN,
            organization: 'org-TDjq9ytBDVcKt4eVSizl0O74'
        });
        this.openAIApi = new OpenAIApi(api_configuration);

        /**
         * @type {Map<string, Map<Model, ContextTree>>}
         */
        this.context_trees_map = new Map();
    }

    /**
     * Find tree by chat and message_id
     * @param {string} chat_id 
     * @param {string} message_id 
     * @returns {ContextTree | null}
     */
    _findContextTree(chat_id, message_id) {
        const trees = this.context_trees_map.get(chat_id);
        for (const tree of trees.values()) {
            if (tree.isNodeExisting({ message_id })) return tree;
        }
        return null;
    }

    /**
     * Creates context tree for specified chat and model if needed
     * @param {string} chat_id 
     * @param {Model | null} model 
     */
    createContextTree(chat_id, model = null) {
        if (!this.context_trees_map.has(chat_id)) {
            this.context_trees_map.set(chat_id, new Map());
        }
        if (!this.context_trees_map.get(chat_id).has(model || CHAT_MODEL_NAME)) {
            const system_prompt = chat_id === -1001625731191 ? `${DEFAULT_SYSTEM_PROMPT}\npeople in this chat: Никита, Danila, Миша, Влад` : null;
            this.context_trees_map.get(chat_id).set(model || CHAT_MODEL_NAME, system_prompt)
        }
    }

    /**
     * Get a context tree fitting the specified arguments
     * @param {chat_id: string, { message_id: string | null, model: Model | null}} 
     * @returns 
     */
    _getContextTree(chat_id, { message_id = null, model = null }) {
        if (!chat_id) {
            throw new Error('No chat_id specified to get context tree');
        }
        if (model) {
            this.createContextTree(chat_id, model);
        }
        else if (messsage_id) {
            let tree = this._findContextTree(chat_id, message_id);
            if (tree) return tree;
            this.createContextTree(chat_id);
        }

        return this.context_trees_map.get(chat_id).get(model || CHAT_MODEL_NAME);
    }

    _replyFromContext(interaction, context, context_tree, prev_message_id) {
        interaction.context.replyWithChatAction('typing');

        const continiousChatAction = setInterval(() => {
            interaction.context.replyWithChatAction('typing');
        }, 5000);

        return this.openAIApi.createChatCompletion({
            model: context_tree.root_node.model,
            messages: context
        }).then(({ data, status } = {}) => {
            clearInterval(continiousChatAction);

            if (status !== 200) {
                this.logger.warn('Non-200 response to ChatGPT Completion', { data: data });
            }

            if (!data?.choices?.length) {
                this.logger.warn('No choices for ChatGPT Completion');
                ['У ChatGPT просто нет слов', null, null, { reply_to_message_id: prev_message_id }];
            }

            return [
                null,
                prepareText(data.choices[0].message.content),
                ({ message_id: new_message_id, text }) => {
                    context_tree.appendNode({
                        role: 'assistant',
                        name: interaction.context.me.first_name,
                        content: text,
                        message_id: new_message_id,
                        prev_message_id
                    });
                },
                { reply_to_message_id: prev_message_id }
            ];
        }).catch(err => {
            clearInterval(continiousChatAction);

            if (err?.response) {
                this.logger.error(`API Error while getting ChatGPT Completion`, { error: err.response?.data || err.response?.status || err})
            }
            else {
                this.logger.error(`Error while getting ChatGPT Completion`, { error: err.stack || err });
            }
            return ['ChatGPT отказывается отвечать, можешь попробовать ещё раз, может он поддастся!', null, null, { reply_to_message_id: prev_message_id }];
        });
    }

    answerReply(interaction) {
        if (!interaction?.context?.message?.reply_to_message || !(interaction?.context?.message?.text || interaction?.context?.message?.caption)) {
            return;
        }

        const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});

        logger.info(`Processing ChatGPT request received with a reply`);

        const context_tree = this._getContextTree(interaction.context.chat.id);

        let prev_message_id = interaction.context.message.reply_to_message.message_id;
        
        if (!context_tree.isNodeExisting({ message_id: prev_message_id })) {
            const text = interaction.context.message.reply_to_message.text || interaction.context.message.reply_to_message.caption;

            if (text) {
                context_tree.appendNode({ role: 'assistant', content: text, message_id: prev_message_id, name: interaction.context.me.first_name });
            }
            else {
                prev_message_id = null;
            }
        }

        const { message_id, from: { first_name: author } } = interaction.context.message;

        // appending user's request to the tree
        {
            const text = interaction.context.message.text || interaction.context.message.caption;
    
            context_tree.appendNode({ role: 'user', content: text, message_id, prev_message_id, name: author });
        }

        const context = context_tree.getContext(message_id);

        return this._replyFromContext(interaction, context, context_tree, message_id)
            .then(([err, response, callback = () => {}, overrides]) => {
                return interaction._reply(response || err, overrides)
                    .then(callback)
                    .catch(err => {
                        this.logger.error('Unprecedent error, it should have been already caught', { error: err.stack || err })
                    });
            });
    }

    // handleContextRequest(interaction) {
    //     const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});
        
    //     logger.info(`Received command: ${interaction.command_name}`);

    //     if (!interaction?.context?.message?.reply_to_message) {
    //         return interaction._reply('Эта команда работает только при реплае на сообщение');
    //     }

    //     const context_tree = this._getContextTree(interaction.context.chat.id);

    //     const message_id = interaction.context.message.reply_to_message.message_id;

    //     const context = context_tree.getRawContext(message_id);

    //     if (!context.length) {
    //         return interaction._reply('Для этого сообщения нет контекста');
    //     }

    //     const context_message = {
    //         type: 'document',
    //         filename: `context_${message_id}.json`,
    //         media: Buffer.from(JSON.stringify(context, null, 2)),
    //         text: 'Контекст'
    //     };

    //     return interaction._replyWithMedia(
    //         context_message,
    //         { reply_to_message_id: interaction.context.message.message_id }
    //     ).catch(err => {
    //         this.logger.error('Error while sending context', { error: err.stack || err });
    //         interaction._reply(`Ошибка во время отправки контекста:\n<code>${err.message}</code>`);
    //     });
    // }

    async handleTreeRequest(context) {
        // const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});

        // logger.info(`Received command: ${interaction.command_name}`);

        const context_tree = this._getContextTree(context.chat.id);
        
        if (!context_tree.nodes.size) {
            return ['Пока дерево пустое.'];
        }

        try {
            const nodes = [...context_tree.nodes.values()];

            const nodes_message = {
                type: 'document',
                filename: 'nodes.json',
                media: Buffer.from(JSON.stringify(nodes, null, 2)),
                text: 'Дерево'
            };

            return [null, nodes_message];
        }
        catch (err) {
            this.logger.error('Error while generating nodes tree', { error: err.stack || err });
            return [`Ошибка во время генерирования дерева контекста:\n<code>${err.message}</code>`];
        }
    }

    async handleAnswerCommand(context, interaction) {
        // const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});

        // logger.info(`Received command: ${interaction.context.message.text}`);

        const command_text = context?.message?.text.replace(new RegExp(`\/answer(@${context.me.username})? ?`), '');

        if (!context?.message?.reply_to_message && !command_text?.length) {
            return ['Отправь эту команду как реплай на другое сообщение или напишите запрос в сообщении с командой, чтобы получить ответ.'];
        }

        if (!context.message?.reply_to_message?.text && !context.message?.reply_to_message?.caption && !command_text?.length) {
            return ['Ни в отвеченном сообщении ни в сообщении с командой нет запроса, а без него никуда.'];
        }

        const context_tree = this._getContextTree(context.chat.id);

        let prev_message_id = null;
        let message_id = null;
        let author = null;

        if (context?.message?.reply_to_message) {
            const text = context.message.reply_to_message.text || context.message.reply_to_message.caption;
            if (text?.length) {
                ({ message_id, from: { first_name: author } } = context.message.reply_to_message);
                if (!context_tree.isNodeExisting({ message_id })) {
                    context_tree.appendNode({
                        role: 'user',
                        content: text,
                        message_id: message_id,
                        name: author
                    });
                }
            }
        }
       
        if (command_text?.length) {
           prev_message_id = message_id;
           ({ message_id, from: { first_name: author } } = context.message);
           context_tree.appendNode({
               role: 'user',
               content: command_text,
               message_id: message_id,
               prev_message_id,
               name: author
           });
        }
        // fetch onlty messages refered by this command
        const gpt_context = prev_message_id ? context_tree.getContext(message_id, 2) : context_tree.getContext(message_id, 1);

        return this._replyFromContext(interaction, gpt_context, context_tree, message_id);
    }

    async handleAdjustSystemPrompt(context) {
        // const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});
        
        // logger.info(`Received command: ${interaction.context.message.text}`);

        const new_system_prompt = context.message.text.split(' ').slice(1).join(' ');
        
        const context_tree = this._getContextTree(context.chat.id);
        
        if (!new_system_prompt) {
            return [`Нужен не пустой системный промпт.\nПо умолчанию: <code>${DEFAULT_SYSTEM_PROMPT}</code>\nСейчас: <code>${context_tree.root_node.content}</code>`];
        }

        context_tree.root_node.content = new_system_prompt;

        return [null, 'Обновил'];
    }

    answerQuestion(interaction) {
        if (!interaction.context.message.text && !interaction.context.message.caption) {
            return;
        }

        const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});
        
        logger.info(`Processing ChatGPT request received by direct message`);

        const context_tree = this._getContextTree(interaction.context.chat.id);

        const {
            message_id,
            from: { first_name: author }
        } = interaction.context.message;

        if (!context_tree.isNodeExisting({ message_id })) {
            const text = interaction.context.message.text || interaction.context.message.caption;

            context_tree.appendNode({ role: 'user', content: text, message_id, name: author });
        }

        const context = context_tree.getContext(message_id);

        return this._replyFromContext(interaction, context, context_tree, message_id)
            .then(([err, response, callback = () => {}, overrides]) => {
                return interaction._reply(response || err, overrides)
                    .then(callback)
                    .catch(err => {
                        this.logger.error('Unprecedent error, it should have been already caught', { error: err.stack || err })
                    });
            });
    }

    async handle
}

module.exports = new ChatGPTHandler();
