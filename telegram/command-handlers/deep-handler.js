const axios = require("axios");
const formData = require('form-data');
const config = require('../../config.json');
const dotenv = require("dotenv-vault-core");
dotenv.config();

const axiosInstance = axios.create({
    headers: {
        "client-library": "deepai-js-client",
        'api-key': process.env.DEEP_AI_TOKEN },
})

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
        };

        if (form.getHeaders !== undefined) {
            req_options.headers = form.getHeaders();
        }

        interaction.replyWithPlaceholder('Генерирую картинку...');

        const res = await axiosInstance.post(config.DEEP_AI_API, form, req_options);

        const { output_url } = res.data;
        this.logger.info(` ${arg} response ready ${output_url}`);

        return [null, { type: 'photo', media: output_url, url: output_url, text: arg }];
    } catch (err) {
        return [`i'm dead fr bruh :\n<code>${err}</code>`];
    }
}

module.exports = {
    generateImage,
}
