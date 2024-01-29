/**
 * HTML Command
 * @namespace html
 * @memberof Telegram.Commands
 */
/**
 * HTML Command Handler
 * @param {import('grammy').Context} ctx
 * @memberof Telegram.Commands.html
 */

async function html(ctx) {
    let text = require('./utils').parseArgs(ctx, 1)[1].trim();
    if (!text) {
        return [`Для того чтобы получить текст, нужно дать текст размеченный HTML`]
    }
    return [null, text, text];
}

module.exports = {
    html,
}
