const { OpenAIApi, Configuration } = require('openai');

// const { Converter: MDConverter } = require('showdown');

// const mdConverter = new MDConverter({
//     noHeaderId: 'true',
//     strikethrough: 'true'
// });

const CHAT_MODEL_NAME = 'gpt-3.5-turbo';

const DEFAULT_SYSTEM_PROMPT = 'you are chat-assistant, answer shortly (less than 3000 characters), always answer in the same language as the question was asked';
/**
   @param {String} input
   @return {String}
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
    constructor({ role, content, message_id, prev_node } = {}) {
        this.role = role;
        this.content = content;
        this.message_id = message_id;
        this.prev_node = prev_node;
    }

    getContextMessage() {
        return {
            role: this.role,
            content: this.content
        };
    }

    getRawContext() {
        return {
            role: this.role,
            content: this.content,
            message_id: this.message_id,
            prev_message_id: this.prev_node?.message_id
        };
    }
}

class ContextTree {
    constructor() {
        this.root_node = new ContextNode({
            role: 'system',
            content: DEFAULT_SYSTEM_PROMPT
        });

        this.nodes = new Map();
    }

    getNode(message_id) {
        return this.nodes.has(message_id) ? this.nodes.get(message_id) : null;
    }

    appendNode({ role, content, message_id, prev_message_id } = {}) {
        let prev_node = this.root_node;

        if (prev_message_id && this.isNodeExisting({ message_id: prev_message_id })) {
            prev_node = this.nodes.get(prev_message_id);
        }

        this.nodes.set(message_id, new ContextNode({ role, content, message_id, prev_node }));
    }

    isNodeExisting({ node, message_id } = {}) {
        if (node) {
            message_id = node.message_id;
        }

        return this.nodes.has(message_id);
    }

    getContext(message_id, limit = 30) {
        if (!this.isNodeExisting({ message_id })) {
            return [this.root_node.getContextMessage()]
        }

        let context = [];

        let last_node = this.getNode(message_id);

        while (last_node && context.length <= limit) {
            context.unshift(last_node.getContextMessage());
            last_node = last_node.prev_node;
        }

        if (context.length === limit && context[0].role === this.root_node.role) {
            context.unshift(this.root_node.getContextMessage());
        }

        return context;
    }

    getRawContext(message_id) {
        const raw_context = [];

        if (!this.isNodeExisting({ message_id })) {
            return raw_context;
        }

        let last_node = this.getNode(message_id);

        while (last_node) {
            raw_context.unshift(last_node.getRawContext());
            last_node = last_node.prev_node;
        }

        return raw_context;
    }
}

class ChatGPTHandler{
    constructor() {
        this.logger = require('../logger').child({ module: 'chatgpt-handler' })
        
        const api_configuration = new Configuration({
            apiKey: process.env.OPENAI_TOKEN
        });
        this.openAIApi = new OpenAIApi(api_configuration);

        this.context_trees_map = new Map();
    }

    _getContextTree(chat_id) {
        if (!chat_id) {
            throw new Error('No chat_id specified to get context tree');
        }
        if (!this.context_trees_map.has(chat_id)) {
            this.context_trees_map.set(chat_id, new ContextTree());
        }
        return this.context_trees_map.get(chat_id);
    }

    _replyFromContext(interaction, context, context_tree, prev_message_id) {
        interaction.context.replyWithChatAction('typing');

        const continiousChatAction = setInterval(() => {
            interaction.context.replyWithChatAction('typing');
        }, 5000);

        this.openAIApi.createChatCompletion({
            model: CHAT_MODEL_NAME,
            messages: context
        }).then(({ data, status } = {}) => {
            clearInterval(continiousChatAction);

            if (status !== 200) {
                this.logger.warn('Non-200 response to ChatGPT Completion', { data: data });
            }

            if (!data?.choices?.length) {
                this.logger.warn('No choices for ChatGPT Completion');
                return interaction._reply('У ChatGPT просто нет слов', { reply_to_message_id: prev_message_id });
            }

            interaction._reply(
                prepareText(data.choices[0].message.content),
                { reply_to_message_id: prev_message_id }
            ).then(({ message_id: new_message_id, text }) => {
                context_tree.appendNode({
                    role: 'assistant',
                    content: text,
                    message_id: new_message_id,
                    prev_message_id
                });
            }).catch(err => {
                this.logger.error('Error while sending ChatGPT completion', { error: err.stack || err });
                interaction._reply(
                    'Ты даже представить себе не можешь, что там ChatGPT придумал, давай по новой',
                    { reply_to_message_id: prev_message_id }
                ).catch(err => {
                    this.logger.error('Safe reply failed', { error: err.stack || err });
                });
            });
        }).catch(err => {
            clearInterval(continiousChatAction);

            this.logger.error(`Error while getting ChatGPT Completion`, { error: err.stack || err });
            interaction._reply(
                'ChatGPT отказывается отвечать, можешь попробовать ещё раз, может он поддастся!',
                { reply_to_message_id: prev_message_id }
            ).catch((err) => {
                this.logger.error('Error while sending a safe reply', { error: err.stack || err });
            });
        });
    }

    answerReply(interaction) {
        if (!interaction?.context?.message?.reply_to_message && !(interaction?.context?.message?.text || interaction?.context?.message?.caption)) {
            return;
        }

        const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});

        logger.info(`Processing ChatGPT request received with a reply`);

        const context_tree = this._getContextTree(interaction.context.chat.id);

        let prev_message_id = interaction.context.message.reply_to_message.message_id;
        
        if (!context_tree.isNodeExisting({ message_id: prev_message_id })) {
            const text = interaction.context.message.reply_to_message.text || interaction.context.message.reply_to_message.caption;

            if (text) {
                context_tree.appendNode({ role: 'assistant', content: text, message_id: prev_message_id });
            }
            else {
                prev_message_id = null;
            }
        }

        const message_id = interaction.context.message.message_id;

        // appending user's request to the tree
        {
            const text = interaction.context.message.text || interaction.context.message.caption;
    
            context_tree.appendNode({ role: 'user', content: text, message_id, prev_message_id });
        }

        const context = context_tree.getContext(message_id);

        this._replyFromContext(interaction, context, context_tree, message_id)
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

    handleTreeRequest(interaction) {
        const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});

        logger.info(`Received command: ${interaction.command_name}`);

        const context_tree = this._getContextTree(interaction.context.chat.id);
        
        if (!context_tree.nodes.size) {
            return interaction._reply('Пока дерево пустое.');
        }

        try {
            const nodes = [...context_tree.nodes.values()];

            const nodes_message = {
                type: 'document',
                filename: 'nodes.json',
                media: Buffer.from(JSON.stringify(nodes, null, 2)),
                text: 'Дерево'
            };

            return interaction._replyWithMedia(nodes_message)
            .catch(err => {
                this.logger.error('Error while sending nodes tree', { error: err.stack || err });
                interaction._reply(`Ошибка во время отправки дерева контекста:\n<code>${err.message}</code>`);
            });
        }
        catch (err) {
            this.logger.error('Error while generating nodes tree', { error: err.stack || err });
            interaction._reply(`Ошибка во время генерирования дерева контекста:\n<code>${err.message}</code>`);
        }
    }

    handleAnswerCommand(interaction) {
        const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});

        logger.info(`Received command: ${interaction.context.message.text}`);

        const command_text = interaction?.context?.message?.text.replace(new RegExp(`\/answer(@${interaction.context.me.username})? ?`), '');
        
        if (!interaction?.context?.message?.reply_to_message && !command_text?.length) {
            return interaction._reply('Отправь эту команду как реплай на другое сообщение или напишите запрос в сообщении с командой, чтобы получить ответ.');
        }

        if (!interaction.context.message?.reply_to_message?.text && !interaction.context.message?.reply_to_message?.caption && !command_text?.length) {
            return interaction._reply('Ни в отвеченном сообщении ни в сообщении с командой нет запроса, а без него никуда.');
        }

        const context_tree = this._getContextTree(interaction.context.chat.id);

        let prev_message_id = null;
        let message_id = null;

        if (interaction?.context?.message?.reply_to_message) {
            const text = interaction.context.message.reply_to_message.text || interaction.context.message.reply_to_message.caption;
            if (text.length) {
                message_id = interaction.context.message.reply_to_message.message_id;
                if (!context_tree.isNodeExisting({ message_id })) {
                    context_tree.appendNode({
                        role: 'user',
                        content: text,
                        message_id: message_id
                    });
                }
            }
        }
       
        if (command_text?.length) {
           prev_message_id = message_id;
           message_id = interaction.context.message.message_id;
           context_tree.appendNode({
               role: 'user',
               content: command_text,
               message_id: message_id,
               prev_message_id
           });
        }
        // fetch onlty messages refered by this command
        const context = prev_message ? context_tree.getContext(message_id, 2) : context_tree.getContext(message_id, 1);

        this._replyFromContext(interaction, context, context_tree, message_id);
    }

    handleAdjustSystemPrompt(interaction) {
        const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});
        
        logger.info(`Received command: ${interaction.context.message.text}`);

        const new_system_prompt = interaction.context.message.text.split(' ').slice(1).join(' ');
        
        const context_tree = this._getContextTree(interaction.context.chat.id);
        
        if (!new_system_prompt) {
            return interaction._reply(`Нужен не пустой системный промпт.\nПо умолчанию: <code>${DEFAULT_SYSTEM_PROMPT}</code>\nСейчас: <code>${context_tree.root_node.content}</code>`);
        }

        context_tree.root_node.content = new_system_prompt;

        interaction._reply('Обновил');
    }

    answerQuestion(interaction) {
        if (!interaction.context.message.text && !interaction.context.message.caption) {
            return;
        }

        const logger = this.logger.child({...interaction.logger.defaultMeta, ...this.logger.defaultMeta});
        
        logger.info(`Processing ChatGPT request received by direct message`);

        const context_tree = this._getContextTree(interaction.context.chat.id);

        const message_id = interaction.context.message.message_id;

        if (!context_tree.isNodeExisting({ message_id })) {
            const text = interaction.context.message.text || interaction.context.message.caption;

            context_tree.appendNode({ role: 'user', content: text, message_id });
        }

        const context = context_tree.getContext(message_id);

        this._replyFromContext(interaction, context, context_tree, message_id);
    }
}

module.exports = {
    ChatGPTHandler
};
