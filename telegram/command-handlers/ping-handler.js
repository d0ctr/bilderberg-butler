/**
 * `/ping` command handler
 * @returns {[null, String]}
 */
async function ping() {
    let message = '<code>pong</code>';
    return [null, message];
}

module.exports = {
    ping,
}
