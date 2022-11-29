const axios = require('axios');
const formData = require('form-data');
const config = require('../../config.json');

async function generateImage(input, interaction) {
    let arg = this._parseArgs(input, 1)[1];
    if (!arg) {
        return [`Не хватает описания картинки`];
    }

    try {
        const form = new formData();
        form.append('text', arg);

        const req_options = {
            withCredentials: true,
            headers: {
                'client-library': 'deepai-js-client',
                'api-key': process.env.DEEP_AI_TOKEN
            }
        };

        if (form.getHeaders !== undefined) {
            req_options.headers = { ...req_options.headers, ...form.getHeaders() };
        }

        interaction.replyWithPlaceholder('Генерирую картинку...');

        const res = await axios.post(config.DEEP_AI_API,
            form,
            req_options
        );

        const { output_url } = res.data;
        this.logger.info(` ${arg} response ready ${output_url}`, { args: [arg] });

        return [null, { type: 'photo', media: output_url, url: output_url, text: arg }];
    } catch (err) {
        this.logger.error(`Error while deep-aiing: ${err.stack || err}`, { error: err.stack || err, args: [arg] })
        return [`i'm dead fr bruh :\n<code>${err.stack || err}</code>`];
    }
}

module.exports = {
    generateImage,
}
