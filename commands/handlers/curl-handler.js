const { default: axios } = require('axios');

const { url_start_regex } = require("../utils");

const definition = {
    command_name: 'curl',
    args: [
        {
            name: 'url',
            type: 'string',
            description: 'Сссылка на ресурс.'
        }
    ],
    limit: 1,
    description: 'Возвращает результат GET запроса к заданному ресурсу.',
    is_inline: false,
};

const condition = true;

/**
 * `/curl` command handler
 * @param {Object} interaction
 * @returns {[String | null, Object | null]} [error, response]
 */

async function handler(interaction) {
    let arg = interaction.args && interaction.args[0];

    if (!arg) {
        return {
            type: 'error',
            text: `Не хватает URL`
        };
    }

    arg = arg.replace(url_start_regex, 'https://');

    let result;
    try {
        result = await axios.get(arg,
            { 
                responseType: 'arraybuffer' 
            }
        );
    }
    catch (err) {
        interaction.logger.error(`Error while curling ${arg}`, { error: err.stack || err });
    }

    if (!result) {
        arg = arg.replace(url_start_regex, 'http://');
        try {
            result = await axios.get(
                arg,
                { 
                    responseType: 'arraybuffer' 
                }
            );
        }
        catch (err) {
            interaction.logger.error(`Error while curling ${arg}`, { error: err.stack || err });
            return {
                type: 'error',
                text: `Что-то пошло не так\nНе могу получить данные по этой ссылке`
            };
        }
    }

    if (!result) {
        return {
            type: 'error',
            text: `Что-то пошло не так\nНе могу получить данные по этой ссылке`
        };
    }
    let filename = arg.split('/').slice(-1)[0] || 'response';

    let type = 'document';

    let caption = `<pre>HTTP/${result.request.res.httpVersion} ${result.status} ${result.statusText}\n`;
    for (const [key, value] of Object.entries(result.headers)) {
        caption += `${key}: ${value}\n`;
    }
    caption += '</pre>';

    if (caption.length >= 1024) {
        caption = `${caption.slice(0, 1015)}...</pre>`;
    }

    if (result.headers['content-type'].includes('text/html')) {
        type = 'document';
        filename = `${filename}.html`;
        result = Buffer.from(result.data);
    }
    else if (result.headers['content-type'].includes('application/json')) {
        type = 'document';
        filename = `${filename}.json`;
        result = Buffer.from(result.data);
    }
    else if (result.headers['content-type'].includes('text/plain')) {
        type = 'document';
        filename = `${filename}.txt`;
        result = Buffer.from(result.data);
    }
    else if (result.headers['content-type'].includes('image/png')
        || result.headers['content-type'].includes('image/jpeg')
        || result.headers['content-type'].includes('image/jpg')
        || result.headers['content-type'].includes('image/gif')) {
        type = 'photo';
        let extension = result.headers['content-type'].split('/')[1];
        if (!filename.endsWith(extension)){
            filename = `${filename}.${extension}`;
        }
        result = Buffer.from(result.data);
    }
    else {
        type = 'document';
        result = Buffer.from(result.data);
    }
    return {
        type: type,
        media: result,
        filename: filename,
        text: caption
    };
}

module.exports = {
    handler,
    definition,
    condition
}
