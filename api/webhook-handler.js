const expressTypes = require('express');

const { Bot } = require('grammy');
const logger = require('../logger').child({ module: 'webhook-handler' });

/**
 * Handler for Webhook POST from another app
 * @param {expressTypes.Request} request 
 * @param {expressTypes.Response} response 
 */
function handleWebhook(request, response) {
    if (!request || !response) return;

    response.sendStatus(200);

    let message_text = '';

    if (request.params.app) {
        message_text += `<b>${request.params.app}</b>\n`;
    }
    if (request.body) {
        message_text += `<code>${JSON.stringify(request.body, null, 4)}</code>`;
    }
    
    if (message_text === '') return;

    new Bot(process.env.WEBHOOK_TELEGRAM_TOKEN).api.sendMessage(request.params.telegram_chat_id, message_text, { parse_mode: 'HTML' })
        .then(() => logger.info(`Sent webhook [POST: ${request.url}] data [text: ${message_text}] to [chat: ${request.params.telegram_chat_id}]`))
        .catch(err => logger.error(`Error while sending webhook [POST: ${request.url}] data [text: ${message_text}] to [chat: ${request.params.telegram_chat_id}]: ${err && err.stack}`));
}

module.exports = { handleWebhook };