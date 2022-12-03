
const log_meta_def = {
    module: 'notion-client'
};

const logger = require('../logger').child(this.log_meta);

function newLogMeta(labels) {
    return {
        ...log_meta_def,
        ...labels
    }
}

/**
 * Save message content to Notion Database
 * @param {Object} message content prepared for saving
 */
function saveMessageContent(message) {

}

module.exports = { saveMessageContent };