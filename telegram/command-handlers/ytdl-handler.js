const axios = require('axios');

/**
 * `/ytdl` command handler
 * @param {GrammyTypes.Context | Object} input
 * @returns {[String | null, String | null]} [err, response]
 */
async function ytdl(input) {
    if (!process.env.YTDL_URL) {
        return ['Комманда недоступна'];
    }

    let url = this._parseArgs(input, 1)[1];

    if (url === undefined) {
        return ['Не хватает ссылки на ресурс, например Youtube'];
    }

    try {
        const { status, data: { body } } = await axios.post(
            `${process.env.YTDL_URL}/ytdl`,
            {
                telegram_chat_id: input.chat?.id,
                url
            }
        );

        if (status !== 200) {
            this.logger.error('Reqeust to YTDL app returned non-200 status code', { error: status });
            return ['Загрузка сейчас невозможна, попробуйте позже'];
        }

        if (body?.status === 'error' || body?.status !== 'ok' || !body?.info) {
            this.logger.error('Request to YTDL app returned error message', { error: body?.message || body?.status });
            return ['У меня что-то сломалось, попробуйте ещё'];
        }
        
        const response = {
            title: body.info.title,
            duration: `${body.info.duration}s`,
            ext: body.info.ext
        };

        return [null, `Началась загрузка:\n<code>${Object.entries(response).reduce((acc, [k, v]) => acc += `${k}: ${v}\n`, '')}</code>`];
    }
    catch (err) {
        this.logger.error('Error while sending reqeust to YTDL app', { error: err.stack || err });
        return [`Произошла какая-то ошибка\n<code>${err}</code>`];
    }
}

module.exports = {
    ytdl
}