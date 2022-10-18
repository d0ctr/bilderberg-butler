/**
 * `/ping` command handler
 * @returns {[null, String]}
 */
const ping = () => {
    let message = '<code>pong</code>';
    return [null, message];
}

module.exports = {
    ping,
}
