const definition = {
    command_name: 'ping',
    description: 'pong.',
    is_inline: true,
};
const condition = true;

/**
 * `/ping` command handler
 * @returns {[null, String]}
 */
async function handler() {
    return {
        type: 'text',
        text: '<code>pong</code>'
    };
}

module.exports = {
    handler,
    definition,
    condition
}
