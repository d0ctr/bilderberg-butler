/**
 * @namespace Models
 * @memberof ChatLLM
 */


/** 
 * @type {Provider}
 * @memberof ChatLLM.Models
 */

/**
 * @enum {Model}
 * @memberof ChatLLM.Models
 */
const Models = Object.freeze({
    GPT_4_1_MINI            :  new Model('openai',    'gpt-4.1-mini',              4096,   true,  true), // the first model is always the default
    GPT_4_1                 :  new Model('openai',    'gpt-4.1',                   4096,   true,  true),
    O3_MINI                 :  new Model('openai',    'o3-mini',                   10000,  false),
    CLAUDE_3_7_SONNET_LATEST:  new Model('anthropic', 'claude-3-7-sonnet-latest',  4096,   true, true),
    CLAUDE_4_OPUS_LATEST    :  new Model('anthropic', 'claude-4-opus-latest',      4096,   true, true),
    
    default                 :  this.Models.GPT_4_1_MINI,

    /**
     * 
     * @param {string} name 
     * @returns {Model}
     */
    fromName: (name) => {
        const normalized = name = name.replace(/[ _\.]+/g, '_').toUpperCase();
        return this.Models[normalized] || this.Models.default();
    }
});

/**
 * @class
 * @memberof ChatLLM.Models
 */
class Model {
    // static GPT_4_1_MINI             = new Model('openai',    'gpt-4.1-mini',              4096,   true,  true);
    // static GPT_4_1                  = new Model('openai',    'gpt-4.1',                   4096,   true,  true);
    // static O3_MINI                  = new Model('openai',    'o3-mini',                   10000,  false);
    // static CLAUDE_3_7_SONNET_LATEST = new Model('anthropic', 'claude-3-7-sonnet-latest',  4096,   true, true);
    // static CLAUDE_4_OPUS_LATEST     = new Model('anthropic', 'claude-4-opus-latest',      4096,   true, true);

    // static DEFAULT = Model.GPT_4_1_MINI;

    
    constructor (provider, name, max_tokens, vision, web_search = false) {
        this.name = name;
        this.max_tokens = max_tokens;
        this.provider = provider;
        this.vision = !!vision;
        this.web_search = !!web_search;
    }

    toString() {
        return this.name;
    }

    getType() {
        this.vision ? 'vision' : 'text';
    }
}

module.exports = {
    Models,
}