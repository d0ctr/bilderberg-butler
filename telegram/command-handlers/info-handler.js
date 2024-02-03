/**
 * Info Command
 * @namespace info
 * @memberof Commands
 */

/**
 * Info Command handler
 * @param {import('grammy').Context} ctx 
 * @memberof Commands.info
 */
async function info(ctx) {
    let message = `Информация об этом чате:
id чата: <code>${ctx.chat.id}</code>
тип чата: <code>${ctx.chat.type}</code>
${ctx.from.id !== ctx.chat.id ? `id отправителя: <code>${ctx.from.id}</code>` : ''}
`
    return [null, message];
}

module.exports = {
    info,
};