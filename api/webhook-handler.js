const expressTypes = require('express');

const { Bot } = require('grammy');
const logger = require('../logger').child({ module: 'webhook-handler' });

/**
 * Handler for Webhook POST from another app
 * @param {expressTypes.Request} request 
 */
function formatGithubWebhook(request) {
    let text = `<b>${request.params.app}</b>\n`;

    let payload = request.body;

    switch(request.get('X-GitHub-Event').toLowerCase()) {
        case 'pull_request':
            text += `${payload.action[0].toUpperCase() + payload.action.substr(1)} PR <a href="${payload.pull_request?.html_url}">#${payload.number}</a>\n`;
            text += `<u>${payload.pull_request?.title}</u>\n`;
            text += `<i>by <a href="${payload.pull_request?.user?.html_url}">@${payload.pull_request?.user?.login}</a></i>\n`;
            break;
        case 'deplyment_status':
            text += `Deployment status: <a href="${payload.deployment_status?.deployment_url}">${payload.deployment_status?.state}</a>\n`;
            text += `Description: <i>${payload.deployment_status?.description}</i>\n`;
            text += `<i>by <a href="${payload.pull_request?.user?.html_url}">@${payload.pull_request?.user?.login}</a></i>\n`;
            break;
        default:
            return `github\n<code>${JSON.stringify(payload, null, 2)}</code>`;
    }

    return text;
}

/**
 * Handler for Webhook POST from another app
 * @param {expressTypes.Request} request 
 */
function formatRailwayWebhook(request) {
    let text = `<b>${request.params.app}</b>\n`;

    let payload = request.body;

    switch(payload.type.toLowerCase()) {
        case 'deploy':
            text += `Deployment: ${payload.project?.name}/${payload.service?.name}\n`;
            text += `Commit message: <i>${payload.deployment?.meta?.commitMessage}</i>\n`;
            text += `Status: <u>${payload.status}</u>\n`;
            break;
        default:
            return `railway.app\n<code>${JSON.stringify(payload, null, 2)}</code>`;
    }

    return text;
}


const formaters = {
    'github': formatGithubWebhook,
    'railway': formatRailwayWebhook,
    'railway.app': formatRailwayWebhook
}

/**
 * Handler for Webhook POST from another app
 * @param {expressTypes.Request} request 
 * @param {expressTypes.Response} response 
 */
function handleWebhook(request, response) {
    if (!request || !response) return;

    response.sendStatus(200);

    let message_text = '';
    
    if (request.params.app && formaters[request.params.app.toLowerCase()]) {
        message_text = formaters[request.params.app.toLowerCase()](request);
    }
    else {
        if (request.params.app) {
            message_text += `<b>${request.params.app}</b>\n`;
        }
        if (request.body) {
            message_text += `<code>${JSON.stringify(request.body, null, 4)}</code>`;
        }
    }
    
    if (message_text === '') return;

    new Bot(process.env.WEBHOOK_TELEGRAM_TOKEN).api.sendMessage(request.params.telegram_chat_id, message_text, { parse_mode: 'HTML' })
        .then(() => logger.info(`Sent webhook [POST: ${request.url}] data [text: ${message_text}] to [chat: ${request.params.telegram_chat_id}]`))
        .catch(err => logger.error(`Error while sending webhook [POST: ${request.url}] data [text: ${message_text}] to [chat: ${request.params.telegram_chat_id}]: ${err && err.stack}`));
}

module.exports = { handleWebhook };