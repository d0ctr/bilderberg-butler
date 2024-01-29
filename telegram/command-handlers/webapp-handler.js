const { InlineKeyboard } = require('grammy');

/**
 * WebApp Command
 * @namespace webapp
 * @memberof Telegram.Commands
 */

/**
 * WebApp Command handler
 * @param {import('grammy').Context} ctx 
 * @memberof Telegram.Commands.webapp
 */
async function webapp (ctx) {
    let message = `\
Нажми на кнопку под этим сообщением, чтобы открыть брузер гетов, этого чата!
    `;

    let other = {
        reply_markup: new InlineKeyboard().webApp('КНОПКА', `${process.env.WEBAPP_URL}/chat/${ctx.chat.id}`)
    }

    return [null, message, null, other];
}

module.exports = {
    webapp
}