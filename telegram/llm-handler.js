const { OpenAI } = require('openai');
const { default: axios } = require('axios');
const { Anthropic } = require('@anthropic-ai/sdk');

const logger = require('../logger').child({ module: __filename });
const { to, convertMD2HTML } = require('../utils');
const { isAutoreplyOn } = require('./command-handlers/autoreply-handler');

const { ADMIN_CHAT_ID } = require('../config.json');

/**
 * ChatLLM
 * @namespace ChatLLM
 */

/** 
 * Model name
 * @typedef {('gpt-4o' | 'claude-3-sonnet-20240229' | 'claude-3-opus-20240229')} Model
 * @memberof ChatLLM
 */
/** 
 * Chat member role name
 * @typedef {('system' | 'developer' | 'assistant' | 'user')} NodeRole
 * @memberof ChatLLM
 */
/** 
 * Complex structure for ChatLLM content
 * @typedef {{type: 'text', text: string}} ComplexContentText
 * @typedef {{type: 'image', image_data: string, image_type: string}} ComplexContentImage
 * @typedef {(ComplexContentText | ComplexContentImage)} ComplexContent
 * @memberof ChatLLM
 */
/** 
 * GPT Message content
 * @typedef {(string | ComplexContent[])} NodeContent
 * @memberof ChatLLM
 */
/** 
 * @typedef {import('./telegram-client').TelegramInteraction} TelegramInteraction
 * @memberof ChatLLM
 */
/** 
 * @typedef {import('@grammyjs/files').FileFlavor<import('grammy').Context>} GrammyContext
 * @memberof ChatLLM
 */
/**
 * @typedef {import('grammy/types').Message} TelegramMessage
 * @memberof ChatLLM
 */
/** 
 * Message, recognisable by ChatLLM
 * @typedef {{
 *  role: NodeRole,
 *  content: NodeContent,
 *  name: (string | null)
 * }} NodeMessage
 * @memberof ChatLLM
 */
/**
 * Full context node data
 * @typedef {{
 *  role: NodeRole,
 *  content: NodeContent,
 *  name: string,
 *  message_id: string,
 *  prev_message_id: (string | undefined),
 *  model: (Model | undefined),
 *  name: (string | undefined)
 * }} NodeRawData
* @memberof ChatLLM
*/

class Model {
  constructor (provider, name, max_tokens, vision) {
      this.name = name;
      this.max_tokens = max_tokens;
      this.provider = provider;
      this.vision = !!vision
  }
}

const models = {
    'gpt-4.1-mini':              new Model('openai',    'gpt-4.1-mini',              4096,   true), // the first model is always the default
    'gpt-4.1':                   new Model('openai',    'gpt-4.1',                   4096,   true),
    'o3-mini':                   new Model('openai',    'o3-mini',                   10000,  false),
    'claude-3-7-sonnet-latest':  new Model('anthropic', 'claude-3-7-sonnet-latest',  4096,   true),
    'claude-3-opus-latest':      new Model('anthropic', 'claude-3-opus-latest',      4096,   true)
};

const CHAT_MODEL_NAME = process.env.LLM_MODEL in models 
                        ? process.env.LLM_MODEL 
                        : Object.keys(models)[0];

const DEFAULT_SYSTEM_PROMPT = `you are a chat-assistant embedded into a Telegram bot`;

const SYSTEM_PROMPT_EXTENSION = '\nyour answers must not exceed 3000 characters!';

/** 
 * @type {Provider}
 * @memberof ChatLLM
 */
const CHAT_PROVIDER = models[CHAT_MODEL_NAME].provider;

/**
 * Get message text combined with entities
 * @param {TelegramMessage} message Telegram message object
 * @returns {string}
 * @memberof ChatLLM
 */
function getWithEntities(message) {
    let goodEntities = (message?.entities || message?.caption_entities || [])?.filter(e => [
        'bold', 'italic', 'underline', 'strikethrough', 'spoiler', 
        'blockquote', 'code', 'pre', 'text_link'
    ].includes(e.type));
    
    let original = message?.text || message?.caption || undefined;
    if (!original?.length) return null;

    let text = '';
    if (message.quote?.is_manual && message.quote?.text?.length) {
        text = message.quote.text.split('\n').map(line => `> ${line}`).join('\n');
    }
    if (!goodEntities.length) return text.length ? `${text}\n\n${original}` : original;
    
    let cursor = 0;
    let entities = goodEntities.sort((a, b) => a.offset - b.offset || b.length - a.length);
    for (const entity of entities) {
        if (cursor < entity.offset) {
            let slice = original.slice(cursor, entity.offset);
            text += slice;
            cursor += slice;
        }
        if (cursor > entity.offset) {
            continue;
        }
        text += to[entity.type](original.slice(entity.offset, entity.offset + entity.length), 'markdown', entity);
        cursor = entity.offset + entity.length;
    }

    if (cursor < entities.slice(-1).offset) {
        text += original.slice(entities.slice(-1).offset + entities.slice(-1).length);
    }

    return text;
}

/**
 * Get content of the message, will return either text or an array
 * @param {GrammyContext}
 * @param {'text' | 'vision'} type
 * @param {TelegramMessage} message
 * @returns {Promise<NodeContent>}
 * @memberof ChatLLM
 */
async function getContent({ api, message: c_message }, type = 'text', message = c_message) {
    if (type !== 'vision' || !message.photo?.[0]) {
        return getWithEntities(message);
    }

    const [file_buffer, content_type] = 
        await api.getFile(message.photo
            .sort((p1, p2) => (p2.height + p2.width) - (p1.height + p1.width))[0].file_id)
        .then(f => f.getUrl())
        .then(file_path => axios.get(
            file_path,
            { 
                responseType: 'arraybuffer',
            }
        ))
        .then(({ data, headers }) => [
            Buffer.from(data).toString('base64'),
            headers['Content-Type'] || 'image/jpeg'
        ])
        .catch(err => {
            logger.error('Failed to get image as buffer', { error: err.stack || err });
            return [];
        });
    if (!(file_buffer || content_type)) {
        return getWithEntities(message);
    }
    /** @type {ComplexContent[]} */
    const content = [{
        type: 'image',
        image_data: file_buffer,
        image_type: content_type,
    }];

    if (message.caption) {
        content.push({
            type: 'text',
            text: message.caption
        });
    }

    return content;
}

/**
 * Get model type based on model name
 * @param {Model} model 
 * @returns {'vision' | 'text'}
 * @memberof ChatLLM
 */
function getModelType(model) {
    return models[model]?.vision ? 'vision' : 'text';
}

/**
 * Get model provider
 * @param {Model} model 
 * @returns {Provider}
 * @memberof ChatLLM
 */
function getProvider(model) {
    return models[model].provider;
}

/**
 * Merge contents for Claude 3 complience
 * @param {NodeContent} prev_content 
 * @param {NodeContent} content 
 * @param {string | undefined} prev_author 
 * @returns {NodeContent}
 */
function mergeContent(prev_content, content, prev_author = 'assistant') {
    let _author_name = prev_author === 'assistant' ? 'you' : prev_author;
    if (Array.isArray(prev_content) && Array.isArray(content)) {
        content.unshift(...prev_content);
        // content[1].text = `Previously ${_author_name} have said:\n"""${prev_content.slice(-1).text}"""\n${content[1].text}`
        return content;
    }
    else if (Array.isArray(content) && typeof prev_content === 'string') {
        if (content.length === 1) {
            content.push({
                type: 'text',
                text: `Previously ${_author_name} have said:\n"""${prev_content}"""`
            });
        }
        else {
            content[1].text = `Previously ${_author_name} have said:\n"""${prev_content}"""\n${content[1].text}`;
        }
        let changed = false;
        for (const piece of content) {
            if (piece.type === 'text') {
                piece.text = `Previously ${_author_name} have said:\n"""${prev_content}"""\n${piece.text}`;
                changed = true;
                break;
            }
        }
        if (!changed) {
            content.push({
                type: 'text',
                text: `Previously ${_author_name} have said:\n"""${prev_content}"""`
            });
        }
        return content;
    }
    else if (typeof content === 'string' && Array.isArray(prev_content)) {
        let changed = false;
        for (const piece of prev_content) {
            if (piece.type === 'text') {
                piece.text = `Previously ${_author_name} have said:\n"""${piece.text}"""\n${content}`;
                changed = true;
                break;
            }
        }
        if (!changed) {
            prev_content.push({
                type: 'text',
                text: content,
            });
        }
        return prev_content;
    }
    else if (typeof prev_content === 'string' && typeof content === 'string') {
        return `Previously ${_author_name} have said:\n"""${prev_content}"""\n${content}`;
    }
}

/**
 * @class
 * @memberof ChatLLM
 */
class ContextNode {
    /**
     * @param {{
     *  role: NodeRole,
     *  content: NodeContent,
     *  message_id: string,
     *  prev_node: ContextNode | undefined,
     *  name: string | undefined,
     *  model: Model | undefined
     * }} 
     */
    constructor({ role, content, message_id, prev_node = null, name = null, model = null } = {}) {
        /** @type {string} */
        this.role = role;

        /** @type {NodeContent} */
        this.content = content;

        /** @type {Set<ContextNode>} */
        this.children = new Set();
        
        if (name) {
            /** @type {string} */
            this.name = name?.replace(/ +/g, '_')?.replace(/[^a-zA-Z0-9_]/g, '')?.slice(0, 64);
        }

        if (message_id) {
            /** @type {string} */
            this.message_id = message_id;
        }
        if (prev_node) {
            /** @type {ContextNode} */
            this.prev_node = prev_node;
        }
        if (model) {
            /** @type {Model} */
            this.model = model;
        }

    }

    /**
     * @param {ContextNode}
     */
    set prev_node(node) {
        this._prev_node?.removeChild(this);
        this._prev_node = node == null ? undefined : node;
        node?.addChild(this);
    }

    /**
     * @returns {ContextNode | undefined}
     */
    get prev_node() {
        return this._prev_node;
    }

    /**
     * Add child to the set
     * @param {ContextNode} node 
     */
    addChild(node) {
        this.children.add(node);
    }

    /**
     * Remove child from set
     * @param {ChildNode} node 
     */
    removeChild(node) {
        this.children.delete(node)
    }

    /**
     * Get nodes data applicable as context
     * @param {Provider | undefined} provider 
     * @returns {NodeMessage}
     */
    getMessage(provider = CHAT_PROVIDER) {
        const message = {
            role: this.role,
            content: this.content,
        };

        if (Array.isArray(this.content)) {
            message.content = [];
            for (let i in this.content) {
                const piece = this.content[i];
                if (piece.type === 'text') {
                    message.content.push(piece);
                }
                else if (provider === 'openai') {
                    message.content.push( {
                        type: 'image_url',
                        image_url: {
                            url: `data:${piece.image_type};base64,${piece.image_data}`
                        },
                    });
                }
                else if (provider === 'anthropic') {
                    message.content.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: piece.image_type,
                            data: piece.image_data,
                        },
                    });
                }
            }
        }
        
        if (this.name && provider === 'openai') message.name = this.name;
        return message;
    }

    /**
     * Get raw data of the node
     * @returns {NodeRawData}
     */
    getRawData() {
        const data = {
            role: this.role,
            content: Array.isArray(this.content) ?
                this.content.map(c => 
                    c.image_data != null ?
                    {...c, image_data: '...buffer...'} :
                    c
                ) :
                this.content,
            message_id: this.message_id,
        };
        if (this.prev_node) data.prev_message_id = this.prev_node.message_id;
        if (this.model) data.model = this.model;
        if (this.name) data.name =  this.name;
        return data;
    }
}

/**
 * @class
 * @memberof ChatLLM
 */
class ContextTree {

    /**
     * 
     * @param {string | undefined} system_prompt 
     * @param {Model | undefined} model
     */
    constructor(system_prompt = DEFAULT_SYSTEM_PROMPT, model = CHAT_MODEL_NAME) {
        /** @type {Map<string, ContextNode>} */
        this.nodes = new Map();

        /** @type {ContextNode} */
        this.root_node = new ContextNode({
            role: model.includes('o3') ? 'developer' : 'system',
            content: (system_prompt || DEFAULT_SYSTEM_PROMPT) + SYSTEM_PROMPT_EXTENSION,
            model: model || CHAT_MODEL_NAME
        });
    }

    /**
     * Get Node by message_id
     * @param {string} message_id 
     * @returns {ContextNode | undefined}
     */
    getNode(message_id) {
        return this.nodes.has(message_id) ? this.nodes.get(message_id) : null;
    }

    /**
     * Creates new node and appends to the tree either by the prev_message_id or to the root node
     * @param {{ role: NodeRole, content: NodeContent, message_id: string, prev_message_id: string, name: string }}
     */
    appendNode({ role, content, message_id, prev_message_id, name } = {}) {
        let prev_node = this.root_node;

        if (prev_message_id && this.checkNodeExists({ message_id: prev_message_id })) {
            prev_node = this.nodes.get(prev_message_id);
        }

        this.nodes.set(message_id, new ContextNode({ role, content, message_id, prev_node, name }));
    }

    /**
     * Checks if node exists either by node's message_id or provided message_id
     * @param {{ node: ContextNode | undefined, message_id: string | undefined }} 
     * @returns {boolean}
     */
    checkNodeExists({ node = null, message_id = null } = {}) {
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
        if (!this.checkNodeExists({ message_id })) {
            return [this.root_node.getMessage()]
        }

        let context = [];

        let last_node = this.getNode(message_id);

        while (last_node && context.length <= limit) {
            context.unshift(last_node.getMessage(this.getProvider()));
            last_node = last_node.prev_node;
        }

        
        if (context[0].role !== this.root_node.role) {
            context.unshift(this.root_node.getMessage());
        }
        
        // this is mandatory only for Claude but let's make it default
        if (context[1].role !== 'user') {
            if (last_node?.role === 'user') {
                context.unshift(last_node);
            }
            else {
                context = [context[0], context.slice(2)];
            }
        }

        return context;
    }


    /**
     * Gets the raw context of the message as an array
     * @param {string | undefined} message_id 
     * @returns {NodeRawData[]}
     */
    getRawContext(message_id = null) {
        const raw_context = [];

        if (!this.checkNodeExists({ message_id })) {
            return raw_context;
        }

        let last_node = this.getNode(message_id);

        while (last_node) {
            raw_context.unshift(last_node.getRawData());
            last_node = last_node.prev_node;
        }

        return raw_context;
    }

    /**
     * Get node by id and remove it from tree (relinks node's children to node's parent)
     * @param {string} message_id
     * @returns {ContextNode | undefined}
     */
    detachNode(message_id) {
        const node = this.nodes.get(message_id);
        node?.children?.forEach(child => {
            child.prev_node = node.prev_node;
            node.children.delete(child);
        });
        return this.nodes.delete(message_id) ? node : null;
    }

    /**
     * Detach the branch where node with specified message_id exists, returns the child of a root node and a map of nodes
     * @param {string} message_id
     * @returns {{node: ContextNode, branch: Map<string, ContextNode>}}
     */
    detachBranch(message_id) {
        if (!this.checkNodeExists({ message_id })) {
            return {};
        }

        let branch_root = null;
        let branch = new Map();

        // going upwards
        let node = this.getNode(message_id);
        while (!['system', 'developer'].includes(node.prev_node.role)) {
            node = node.prev_node;
        }

        // last prev_node is right under root
        branch_root = node;
        branch_root.prev_node = null;
        branch.set(branch_root.message_id, branch_root);
        this.nodes.delete(branch_root.message_id);

        // processing downwards
        const processChildren = (node) => {
            node.children.forEach(child => {
                branch.set(child.message_id, child);
                this.nodes.delete(child.message_id);
                if (child.children.size) processChildren(child);
            });
        };

        processChildren(branch_root);
        return { node: branch_root, branch };
    }

    /**
     * Append branch to the tree
     * @param {ContextNode} node leading node (that should be attached to root)
     * @param {Map<string, ContextNode>} branch map of nodes including {@link node}
     */
    appendBranch(node, branch) {
        node.prev_node = this.root_node;
        branch.forEach((node, message_id) => {
            this.nodes.set(message_id, node);
        });
    }

    /**
     * Get type of the model used for the tree
     * @returns {'text' | 'vision'}
     */
    getModelType() {
        return getModelType(this.root_node.model);
    }

    /**
     * Get provider for model in the tree
     * @returns {Provider}
     */
    getProvider() {
        return getProvider(this.root_node.model);
    }
}

/**
 * @class
 * @memberof ChatLLM
 */
class ChatLLMHandler {
    static #INSTANCE = new ChatLLMHandler();

    constructor() {
        /** @type {logger} */
        this.logger = logger;

        /** @type {OpenAI} */
        process.env.OPENAI_TOKEN && (this.openAI = new OpenAI({
            apiKey: process.env.OPENAI_TOKEN,
            organization: 'org-TDjq9ytBDVcKt4eVSizl0O74'
        }));

        /** @type {Anthropic} */
        process.env.ANTHROPIC_TOKEN && (this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_TOKEN,
        }));

        /** @type {Map<string, Map<Model, ContextTree>>} */
        this.context_trees_map = new Map();
    }

    /**
     * Find tree by chat and message_id
     * @param {string} chat_id 
     * @param {string} message_id 
     * @returns {ContextTree | undefined}
     */
    _findContextTree(chat_id, message_id) {
        const trees = this.context_trees_map.get(chat_id);
        if (!trees) return null;
        for (const tree of trees.values()) {
            if (tree.checkNodeExists({ message_id })) return tree;
        }
        return null;
    }

    /**
     * Creates context tree for specified chat and model if needed
     * @param {string} chat_id 
     * @param {Model} model 
     */
    _createContextTree(chat_id, model = CHAT_MODEL_NAME) {
        if (!this.context_trees_map.has(chat_id)) {
            this.context_trees_map.set(chat_id, new Map());
        }
        if (!this.context_trees_map.get(chat_id).has(model)) {
            const system_prompt = chat_id === parseInt(ADMIN_CHAT_ID.TG) ? `${DEFAULT_SYSTEM_PROMPT}\npeople in this chat: Никита, Danila, Миша, Влад` : null;
            this.context_trees_map.get(chat_id).set(model, new ContextTree(system_prompt, model))
        }
    }

    /**
     * Get a context tree fitting the specified arguments
     * @param {string} chat_id
     * @param {{message_id: string | undefined, model: Model}} 
     * @returns {ContextTree}
     */
    _getContextTree(chat_id, { message_id = null, model = CHAT_MODEL_NAME } = {}) {
        if (!chat_id) {
            throw new Error('No chat_id specified to get context tree');
        }

        if (message_id) {
            let tree = this._findContextTree(chat_id, message_id);
            if (tree) return tree;
        }
    
        this._createContextTree(chat_id, model);
    
        return this.context_trees_map.get(chat_id).get(model);
    }

    /**
     * Get array of trees associated with chat
     * @param {string} chat_id 
     * @returns {ContextTree[]}
     */
    _getChatTrees(chat_id) {
        return this.context_trees_map.has(chat_id) ? [...this.context_trees_map.get(chat_id).values()] : [];
    }

    /**
     * Move branch from one tree to another
     * @param {string} message_id 
     * @param {ContextTree} source_context_tree 
     * @param {ContextTree} destination_context_tree 
     */
    _transferContextBranch(message_id, source_context_tree, destination_context_tree) {
        const { node, branch } = source_context_tree.detachBranch(message_id);
        destination_context_tree.appendBranch(node, branch);
    }

    /**
     * Makes an OpenAI API request with provided context and returnes response as text
     * @param {TelegramInteraction} interaction 
     * @param {NodeMessage[]} context 
     * @param {ContextTree} context_tree 
     * @param {string} prev_message_id 
     * @returns {Promise<CommandResponse>}
     */
    async _replyFromContext(interaction, context, context_tree, prev_message_id) {
        interaction.context.replyWithChatAction('typing');

        const continiousChatAction = setInterval(() => {
            interaction.context.replyWithChatAction('typing');
        }, 5000);

        const responsePromise = context_tree.getProvider() === 'openai' 
            ? this.openAI.chat.completions.create({
                model: context_tree.root_node.model,
                max_completion_tokens: models[context_tree.root_node.model].max_tokens,
                messages: context,
            })
            : this.anthropic.messages.create({
                model: context_tree.root_node.model,
                max_tokens: models[context_tree.root_node.model].max_tokens,
                system: context.shift()?.content || undefined,
                messages: context,
            });

        return responsePromise.then((data) => {
            if (!data) {
                this.logger.warn('No response to ChatLLM Completion', { data, provider: context_tree.getProvider() });
                return ['ChatLLM сломался, попробуй спросить позже', null, null, { reply_parameters: { message_id: prev_message_id } }];
            }

            if (!data?.choices?.length && !data?.content?.length) {
                this.logger.warn('No choices for ChatLLM Completion');
                return ['У ChatLLM просто нет слов', null, null, { reply_parameters: { message_id: prev_message_id } }];
            }

            let answer = context_tree.getProvider() === 'openai'
                ? data.choices[0].message.content
                : data.content[0].text;

            return [
                null,
                convertMD2HTML(answer),
                ({ message_id: new_message_id } = {}) => {
                    if (!new_message_id) return;
                    context_tree.appendNode({
                        role: 'assistant',
                        name: interaction.context.me.first_name,
                        content: answer,
                        message_id: new_message_id,
                        prev_message_id
                    });
                },
                {
                    reply_parameters: { message_id: prev_message_id },
                    parse_mode: 'HTML',
                    original: { text: answer, parse_mode: 'markdown' }
                }
            ];
        }).catch(err => {
            if (err?.response) {
                this.logger.error(`API Error while getting ChatLLM Completion`, { error: err.response?.data || err.response?.status || err})
            }
            else {
                this.logger.error(`Error while getting ChatLLM Completion`, { error: err.stack || err });
            }
            return ['ChatLLM отказывается отвечать, можешь попробовать ещё раз, может он поддастся!', null, null, { reply_to_message_id: prev_message_id }];
        }).finally(() => {
            clearInterval(continiousChatAction);
        });
    }

    /**
     * Proxy to {@link ChatLLM._replyFromContext} when answering to direct message or reply
     * @param {TelegramInteraction} interaction 
     * @param {NodeMessage[]} context 
     * @param {ContextTree} context_tree 
     * @param {string} prev_message_id 
     * @returns {Promise}
     */
    async _sendDirectResponse(interaction, context, context_tree, prev_message_id) {
        return this._replyFromContext(interaction, context, context_tree, prev_message_id)
            .then(([err, response, callback = () => {}, overrides]) => {
                return interaction._reply(response || err, overrides)
                    .catch(err => {
                        if (!err?.description?.includes('message is too long')) throw err;
                        return interaction._replyWithArticle(response, overrides);
                    })
                    .then(callback)
                    .catch(err => {
                        this.logger.error('Failed to send gpt response in a direct message', { error: err.stack || err })
                    });
            });
    }

    /**
     * Answer request received via reply
     * @param {TelegramInteraction} interaction
     * @returns {Promise}
     */
    async answerReply(interaction) {
        let text = getWithEntities(interaction.context?.message);
        if (
            !interaction.context?.message?.reply_to_message
            || !text 
            || text.startsWith('/ ')
        ) {
            return;
        }

        const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});

        logger.info(`Processing ChatLLM request received with a reply`);
        
        let prev_message_id = interaction.context.message.reply_to_message.message_id;

        const context_tree = this._getContextTree(interaction.context.chat.id, { message_id: prev_message_id });
        const model_type = context_tree.getModelType();
        let prev_content;
        
        if (!context_tree.checkNodeExists({ message_id: prev_message_id })) {
            prev_content = await getContent(interaction.context, model_type, interaction.context.message.reply_to_message)
                .catch(err => {
                    interaction.logger.error('Failed to acquire content for reply message', { error: err.stack || err});
                    return getWithEntities(interaction.context.message.reply_to_message);
                });
        }

        const { message_id, from: { first_name: author } } = interaction.context.message;

        // appending user's request to the tree
        {
            let content = await getContent(interaction.context, model_type)
                .catch(err => {
                    interaction.logger.error('Failed to acquire content for message', { error: err.stack || err });
                    return text;
                });
            
            if (prev_content != null) {
                content = mergeContent(prev_content, content);
            }
    
            context_tree.appendNode({ role: 'user', content, message_id, prev_message_id, name: author });
        }

        const context = context_tree.getContext(message_id);

        return this._sendDirectResponse(interaction, context, context_tree, message_id);
    }

    /**
     * Respond with file containing context of the message
     * @param {GrammyContext} interaction 
     * @returns {CommandResponse}
     */
    async handleContextRequest(interaction) {
        if (!interaction?.message?.reply_to_message) {
            return ['Эта команда работает только при реплае на сообщение'];
        }
        
        const message_id = interaction.message.reply_to_message.message_id;

        const context_tree = this._getContextTree(interaction.chat.id, { message_id });

        const raw_context = context_tree.getRawContext(message_id);

        if (!raw_context.length) {
            return ['Для этого сообщения нет контекста'];
        }

        try {
            const context_message = {
                type: 'document',
                filename: `context_${message_id}.json`,
                media: Buffer.from(JSON.stringify(raw_context, null, 2)),
                text: 'Контекст'
            };

            return [null, context_message];
        }
        catch (err) {
            this.logger.error('Error while sending context', { error: err.stack || err });
            return [`Ошибка во время отправки контекста:\n<code>${err.message}</code>`];
        }
    }

    /**
     * Respond with file containing context trees of the chat
     * @param {GrammyContext} interaction 
     * @returns {CommandResponse}
     */
    async handleTreeRequest(interaction) {
        const context_trees = this._getChatTrees(interaction.chat.id);
        
        if (!context_trees.length) {
            return ['Пока деревьев нет.'];
        }

        try {
            const nodes = context_trees.map(tree => [...tree.nodes.values()]);

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

    /**
     * Respond with ChatLLM response based on provided model, content of the replied message and/or text provided with the command
     * @param {GrammyContext} interaction_context 
     * @param {TelegramInteraction} interaction 
     * @param {Model} model 
     * @returns {Promise}
     */
    async handleAnswerCommand(interaction_context, interaction, model = CHAT_MODEL_NAME) {
        const command_text = interaction_context.message.text.split(' ').slice(1).join(' ');
        const model_type = getModelType(model);
        let reply_text = getWithEntities(interaction_context.message.reply_to_message);

        if ((
                (
                    getModelType(model) === 'text' 
                    && !reply_text
                ) || (
                    getModelType(model) === 'vision' 
                    && !(interaction_context.message.reply_to_message?.photo?.length 
                    || reply_text)
                )
            ) && !command_text.length)
            {
            return ['Отправь эту команду как реплай на другое сообщение или напишите запрос в сообщении с командой, чтобы получить ответ.'];
        }

        let context_tree = this._getContextTree(interaction_context.chat.id, { model });

        let prev_message_id = null;
        let message_id = null;
        let author = null;
        let prev_content;

        if (interaction_context.message.reply_to_message) {
            ({ message_id, from: { first_name: author } } = interaction_context.message.reply_to_message);
            context_tree = this._getContextTree(interaction_context.chat.id, { message_id, model })
            const content = await getContent(interaction_context, model_type, interaction_context.message.reply_to_message);
            author = interaction_context.message.reply_to_message.from.id === interaction_context.me.id ? 'assistant' : author;
            if (content.length) {
                if (!context_tree.checkNodeExists({ message_id }) && command_text?.length) {
                    prev_content = content;
                    // context_tree.appendNode({
                    //     role: (command_text?.length && interaction_context.from.id === interaction_context.me.id) ? 'assistant' : 'user',
                    //     content,
                    //     message_id: message_id,
                    //     name: author
                    // });
                }
                else if (!context_tree.checkNodeExists({ message_id }) && !command_text?.length) {
                    context_tree.appendNode({
                        role: 'user',
                        content: author === 'assistant' ? mergeContent(content, '', author) : content,
                        message_id,
                        name: author
                    });
                }
                else if (context_tree.getModelType() !== model_type) {
                    context_tree.getNode(message_id).content = content;
                }
            }
        }

        if (command_text?.length) {
            prev_message_id = message_id;
            let prev_author = author;
            ({ message_id, from: { first_name: author } } = interaction_context.message);

            context_tree.appendNode({
                role: 'user',
                content: prev_content != null ? mergeContent(prev_content, command_text, prev_author) : command_text,
                message_id,
                prev_message_id,
                name: author
            });
        }

        if (context_tree.root_node.model !== model) {
            const new_tree = this._getContextTree(interaction_context.chat.id, { model });
            this._transferContextBranch(message_id, context_tree, new_tree);
            context_tree = new_tree;
        }

        const context = context_tree.getContext(message_id);
        // fetch only messages refered by this command
        // const gpt_context = prev_message_id ? context_tree.getContext(message_id, 2) : context_tree.getContext(message_id, 1);

        return this._replyFromContext(interaction, context, context_tree, message_id);
    }

    /**
     * Change the system prompt for the chat's context trees
     * @param {TelegramInteraction} context 
     * @returns {ComplexContent}
     */
    async handleAdjustSystemPrompt(context) {
        const new_system_prompt = context.message.text.split(' ').slice(1).join(' ');
        
        const context_tree = this._getContextTree(context.chat.id);
        
        if (!new_system_prompt) {
            return [`Нужен не пустой системный промпт.\nПо умолчанию: <code>${DEFAULT_SYSTEM_PROMPT}</code>\nСейчас: <code>${context_tree.root_node.content}</code>`];
        }

        context_tree.root_node.content = new_system_prompt + SYSTEM_PROMPT_EXTENSION;

        return [null, 'Обновил'];
    }

    /**
     * Answer request received by DM
     * @param {TelegramInteraction} interaction 
     * @returns {Promise}
     */
    async answerQuestion(interaction) {
        let text = getWithEntities(interaction.context.message);
        if (!text || text.startsWith('/')) {
            return;
        }

        const autoreply = await isAutoreplyOn(interaction.context.chat.id);
        if (!autoreply) return;

        const default_model = await getModel(interaction.context.chat.id);

        const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});
        
        logger.info(`Processing ChatLLM request received by direct message`);

        const context_tree = this._getContextTree(interaction.context.chat.id, { model: default_model || undefined });
        const model_type = context_tree.getModelType();

        const {
            message_id,
            from: { first_name: author }
        } = interaction.context.message;

        if (!context_tree.checkNodeExists({ message_id })) {
            const content = await getContent(interaction.context, model_type);

            context_tree.appendNode({ role: 'user', content, message_id, name: author });
        }

        const context = context_tree.getContext(message_id);

        return this._sendDirectResponse(interaction, context, context_tree, message_id);
    }

    /**
     * Proxy to {@link ChatLLMHandler#handleAnswerCommand handleAnswerCommand}, mainly used to specify model
     * @param {Model} model 
     * @param {GrammyContext} context 
     * @param {TelegramInteraction} interaction 
     * @returns {Promise}
     */
    async handleModeledAnswerCommand(model, context, interaction) {
        if (model === 'default') {
            const { getModel } = require('./command-handlers/model-handler');
            model = await getModel(context.chat.id) || undefined;
        }
        return await this.handleAnswerCommand(context, interaction, model);
    }

    static getModels() {
        return Object.keys(models);
    }

    static getInstance() {
        return this.#INSTANCE;
    }
}

module.exports = ChatLLMHandler;
