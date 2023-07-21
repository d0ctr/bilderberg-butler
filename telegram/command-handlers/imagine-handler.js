const { OpenAIApi, Configuration } = require('openai');

const getImages = async (prompt, { n = 4, size = '512x512' } = {}) => {
    return new OpenAIApi(new Configuration({
        apiKey: process.env.OPENAI_TOKEN
    })).createImage({
        prompt,
        n,
        size
    });
};

async function imagine(input) {
    let arg = this._parseArgs(input, 1)[1];
    if (!arg) {
        return ['Нужен промпт'];
    }

    input.replyWithChatAction('upload_photo');

    const continiousChatAction = setInterval(() => {
        input.replyWithChatAction('upload_photo');
    }, 5000);

    const callback = () => {
        clearInterval(continiousChatAction);
    }

    const res = await getImages(arg);

    if (!res?.data?.data?.length || !Array.isArray(res?.data?.data)) return ['Не получилось ничего сгенерировать, попробуй ещё.'];

    const media = res.data.data.map((image_response) => {
        return {
            type: 'photo',
            media: image_response.url
        };
    });

    return [null, { type: 'media_group', media }, callback];
}

module.exports = {
    imagine
};