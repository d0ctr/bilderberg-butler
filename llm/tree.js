const { Models } = require('./models');

/**
 * @namespace Tree
 * @memberof ChatLLM
 */

/** 
 * Chat member role name
 * @typedef {('system' | 'developer' | 'assistant' | 'user')} NodeRole
 * @memberof ChatLLM.Tree
 */


/** 
 * Complex structure for ChatLLM content
 * @typedef {{type: 'text', text: string}} ComplexContentText
 * @typedef {{type: 'image', image_data: string, image_type: string}} ComplexContentImage
 * @typedef {(ComplexContentText | ComplexContentImage)} ComplexContent
 * @memberof ChatLLM.Tree
 */

/** 
 * Message, recognisable by ChatLLM
 * @typedef {{
*  role: NodeRole,
*  content: NodeContent,
*  name: (string | null)
* }} NodeMessage
* @memberof ChatLLM.Tree
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
* @memberof ChatLLM.Tree
*/

/**
 * 
 * @typedef {{
 * }} NodeContent
* @memberof ChatLLM.Tree
 */

/**
 * @class
 * @memberof ChatLLM.Tree
 */
class ContextNode {
    /**
     * @param {{
     *  role: NodeRole,
     *  content: NodeContent,
     *  message_id: string,
     *  prev_node: ContextNode | undefined,
     *  name: string | undefined,
     *  model: Models | undefined
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
            /** @type {Models} */
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
     * @returns {NodeMessage}
     */
    getMessage() {
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
                } else if (this.model.provider === 'openai') {
                    message.content.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:${piece.image_type};base64,${piece.image_data}`
                        },
                    });
                } else if (this.model.provider === 'anthropic') {
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
        
        if (this.name && this.model.provider === 'openai') message.name = this.name;
        return message;
    }

    /**
     * Get raw data of the node
     * @returns {NodeRawData}
     */
    getRawData() {
        const data = {
            role: this.role,
            content: Array.isArray(this.content) 
                ? this.content.map(c => 
                    c.image_data != null ?
                    {...c, image_data: '...buffer...'} :
                    c)
                : this.content,
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
 * @memberof ChatLLM.Tree
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
            context.unshift(last_node.getMessage());
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
        return this.root_node.model?.vision ? 'vision' : 'text';
    }

    /**
     * Get provider for model in the tree
     * @returns {Provider}
     */
    getProvider() {
        return this.root_node.model?.provider;
    }
}

module.exports = {
    ContextNode,
    ContextTree,
}