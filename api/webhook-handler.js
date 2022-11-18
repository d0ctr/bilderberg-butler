const express = require('express');

const { Bot } = require('grammy');
const logger = require('../logger').child({ module: 'webhook-handler' });

/**
 * Handler for Webhook POST from another app
 * @param {express.Request} request 
 */
function formatGithubWebhook(request) {
    let text = `<b>${request.params.app}</b>\n`;

    let payload = request.body;

    switch(request.get('X-GitHub-Event').toLowerCase()) {
        case 'pull_request':
            text += `${payload.action[0].toUpperCase() + payload.action.slice(1)} PR <a href="${payload.pull_request.html_url}">#${payload.number}</a>\n`;
            text += `<u>${payload.pull_request.title}</u>\n`;
            text += `<i>by <a href="${payload.pull_request.user.html_url}">@${payload.pull_request.user.login}</a></i>\n`;
            break;
        case 'deployment_status':
            text += `Deployment: ${payload.repository.full_name}:${payload.deployment.environment}\n`;
            text += `Description: <i>${payload.deployment_status.description || ' '}</i>\n`;
            text += `State: <u>${payload.deployment_status.state.toUpperCase()}</u>\n`;
            text += `<i>by @<a href="${payload.deployment_status.creator.html_url}">${payload.deployment_status.creator.login}</a></i>\n`;
            break;
        default:
            return `github\n<code>${JSON.stringify(payload, null, 2)}</code>`;
    }

    return text;
}

/**
 * 
 * @param {express.Request} request 
 */
function formatRailwayWebhook(request) {
    let text = `<b>${request.params.app}</b>\n`;

    let payload = request.body;

    switch(payload.type.toLowerCase()) {
        case 'deploy':
            text += `Deployment: ${payload.project.name}:${payload.service.name}\n`;
            text += `Commit message: <i>${payload.deployment.meta.commitMessage}</i>\n`;
            text += `Status: <u>${payload.status}</u>\n`;
            break;
        default:
            return `railway.app\n<code>${JSON.stringify(payload, null, 2)}</code>`;
    }

    return text;
}

/**
 * Handler for Webhook POST from another app
 * @param {express.Request} request 
 */
function formatDefaultWebhook(request) {
    let text = `<b>${request.params.app}</b>\n`;

    if (request.body) {
        text += `${JSON.stringify(request.body, null, 2)}`;
    }

    return text;
}


const formatters = {
    'github': formatGithubWebhook,
    'railway': formatRailwayWebhook,
    'railway.app': formatRailwayWebhook,
    'default': formatDefaultWebhook,
};

/**
 * Handler for Webhook POST from another app
 * @param {express.Request} request 
 * @param {express.Response} response 
 */
function handleWebhook(request, response) {
    if (!(request && response && request.params && request.params.app && request.params.telegram_chat_id)) return;

    response.sendStatus(200);

    logger.info(`Received payload [${request.method}: ${request.originalUrl}] [headers: ${JSON.stringify(request.headers)}] [body: ${JSON.stringify(request.body)}]`);

    let message_text = '';
    
    if (formatters[request.params.app.toLowerCase()]) {
        try {
            message_text = formatters[request.params.app.toLowerCase()](request);
        }
        catch(err) {
            logger.error(`Error while formatting payload from [${request.method}: ${request.originalUrl}]: ${err || err.stack}`);
            logger.info(`Formatting [${request.method}: ${request.originalUrl}] with default formatter`);
            message_text = '';
        }
    }

    if (message_text === '') {
        message_text = formatDefaultWebhook(request);
    }

    new Bot(process.env.WEBHOOK_TELEGRAM_TOKEN).api.sendMessage(request.params.telegram_chat_id, message_text, { parse_mode: 'HTML' })
        .then(() => logger.info(`Sent webhook [${request.method}: ${request.originalUrl}] data [text: ${message_text}] to [chat: ${request.params.telegram_chat_id}]`))
        .catch(err => logger.error(`Error while sending webhook [${request.method}: ${request.originalUrl}] data [text: ${message_text}] to [chat: ${request.params.telegram_chat_id}]: ${err || err.stack}`));
}

module.exports = { handleWebhook };