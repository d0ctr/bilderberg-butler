const {url_start_regex} = require("./utils");
const axios = require('axios').default;

/**
 * `/curl` command handler
 * @param {GrammyTypes.Context | Object} input
 * @returns {[String | null, Object | null]} [error, answer]
 */

async function curl(input) {
    let arg = this._parseArgs(input, 1)[1];
    if (!arg) {
        return [`Не хватает URL`];
    }
    arg = arg.replace(url_start_regex, 'https://');
    let result;
    try {
        result = await axios.get(arg/**, { responseType: 'arraybuffer' } */);
    }
    catch (err) {
        this.logger.error(`Error while curling ${arg}: ${err.stack || err}`, { args: [arg], error: err.stack || err });
    }
    if (!result) {
        arg = arg.replace(url_start_regex, 'http://');
        try {
            result = await axios.get(arg);
        }
        catch (err) {
            this.logger.error(`Error while curling ${arg}: ${err.stack || err}`, { args: [arg], error: err.stack || err });
            return [`Что-то пошло не так\nНе могу получить данные по этой ссылке`];
        }
    }
    if (!result) {
        return [`Что-то пошло не так\nНе могу получить данные по этой ссылке`];
    }
    let filename = arg.split('/').slice(-1)[0] || 'response';
    let type = 'document';
    let caption = `<code>HTTP/${result.request.res.httpVersion} ${result.status} ${result.statusText}\n`;
    for (const [key, value] of Object.entries(result.headers)) {
        caption += `${key}: ${value}\n`;
    }
    caption += '</code>';
    if (caption.length >= 1024) {
        caption = `${caption.slice(0, 1014)}...</code>`;
    }
    if (result.headers['content-type'].includes('text/html')) {
        type = 'document';
        filename = `${filename}.html`;
        result = Buffer.from(result.data);
    }
    else if (result.headers['content-type'].includes('application/json')) {
        type = 'document';
        filename = `${filename}.json`;
        result = Buffer.from(JSON.stringify(result.data, null, 2));
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
    return [null, { type: type, media: result, filename: filename, text: caption }];
}

module.exports = {
    curl,
}
