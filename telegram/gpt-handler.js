const { OpenAIApi, Configuration } = require('openai');

const CHAT_MODEL_NAME = 'gpt-3.5-turbo';

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
}

class ContextTree {
    constructor({ role, content } = {}) {
        this.root_node = new ContextNode({ role, content });

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

        if (context.length === limit) {
            context.unshift(this.root_node.getContextMessage())
        }

        return context;
    }
}


class ChatGPTHandler{
    constructor() {
        this.logger = require('../logger').child({ module: 'chatgpt-handler' })
        
        const api_configuration = new Configuration({
            apiKey: process.env.OPENAI_TOKEN
        });
        this.openAIApi = new OpenAIApi(api_configuration);

        const system_prompt = {
            role: 'system',
            content: 'you are chat-assistant, answer shortly (less than 3000 characters), always answer in the same language as the question was asked'
        };

        this.context_tree = new ContextTree(system_prompt);
    }

    answerQuestion(interaction) {
        if (!interaction?.context?.message?.reply_to_message && !(interaction?.context?.message?.text || interaction?.context?.message?.caption)) {
            return;
        }

        const prev_message_id = interaction.context.message.reply_to_message.message_id;
        
        if (!this.context_tree.isNodeExisting(prev_message_id)) {
            const text = interaction.context.message.reply_to_message.text || interaction.context.message.reply_to_message.caption;

            this.context_tree.appendNode({ role: 'assistant', content: text, message_id: prev_message_id });
        }

        const message_id = interaction.context.message.message_id;

        // appending user's request to the tree
        {
            const text = interaction.context.message.text || interaction.context.message.caption;
    
            this.context_tree.appendNode({ role: 'user', content: text, message_id, prev_message_id });
        }

        const context = this.context_tree.getContext(message_id);

        this.openAIApi.createChatCompletion({
            model: CHAT_MODEL_NAME,
            messages: context
        }).then(({ data, status } = {}) => {
            if (status !== 200) {
                this.logger.warn('Non-200 response to ChatGPT Completion', { data: data });
            }

            if (!data?.choices?.length) {
                this.logger.warn('No choices for ChatGPT Completion');
                return interaction._reply('У ChatGPT просто нет слов', { reply_to_message_id: message_id });
            }

            interaction._reply(
                data.choices[0].message.content,
                { reply_to_message_id: message_id }
            ).then(({ message_id: new_message_id, text }) => {
                this.context_tree.appendNode({ role: 'assistant', content: text, message_id: new_message_id, prev_message_id: message_id });
            }).catch(err => {
                this.logger.error('Error while sending ChatGPT completion', { error: err.stack || err });
                interaction._reply(
                    'Ты даже представить себе не можешь, что там ChatGPT придумал, давай поновой',
                    { reply_to_message_id: message_id }
                ).catch(err => {
                    this.logger.error('Safe reply failed', { error: err.stack || err });
                });
            });
        }).catch(err => {
            this.logger.error(`Error while getting ChatGPT Completion`, { error: err.stack || err });
        });
    }
}

module.exports = {
    ChatGPTHandler
};