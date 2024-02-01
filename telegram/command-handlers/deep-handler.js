const { default: axios } = require('axios');
const formData = require('form-data');
const config = require('../../config.json');

/**
 * Deep Command
 * @namespace deep
 * @memberof Commands
 */

/**
 * Deep Command Handler
 * @param {import('grammy').Context} ctx 
 * @param {import('../telegram-client').TelegramInteraction} interaction
 * @memberof Commands.deep
 */
async function generateImage(ctx, interaction) {
    let arg = require('./utils').parseArgs(ctx, 1)[1];
    if (!arg) {
        return [`Не хватает описания картинки`];
    }

    const callback = () => interaction.deletePlaceholder();

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
        interaction.logger.info(`${arg} response ready ${output_url}`, { args: [arg] });

        return [null, { type: 'photo', media: output_url, url: output_url, text: arg }, callback];
    } catch (err) {
        interaction.logger.error(`Error while deep-aiing`, { error: err.stack || err, args: [arg] })
        return [`i'm dead fr bruh :\n<code>${err.message}</code>`, null, callback];
    }
}

module.exports = {
    generateImage,
}
