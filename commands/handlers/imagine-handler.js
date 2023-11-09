const { OpenAI } = require('openai');

// OpenAI rules
const allowedSizes = ['1024x1024', '1792x1024', '1024x1792'];

const openai = new OpenAI({
    apiKey: process.env.OPENAI_TOKEN,
    organization: 'org-TDjq9ytBDVcKt4eVSizl0O74',
});

const getImages = async (prompt, { size = allowedSizes[0] } = {}) => {
    return openai.images.generate({
        model: 'dall-e-3',
        prompt,
        size
    });
};

exports.definition = {
    command_name: 'imagine',
    args: [
        {
            name: 'query',
            type: 'string',
            description: 'Запрос для генерации',
            optional: false,
        },
        // {
        //     name: 'size',
        //     type: 'string',
        //     description: 'Размер изображения, например [512x512]',
        //     optional: true,
        // },
    ],
    limit: 1,
    is_inline: false,
    description: 'Генерирует картинку с помощью DALL-E 3'
};

exports.condition = !!process.env.OPENAI_TOKEN;

exports.handler = async (interaction) => {
    /** @type {string} */
    let args = interaction.args?.[0];
    if (!args) {
        return {
            type: 'error',
            text: 'Нужен промпт',
        };
    }

    const providedSize = args.match('\[[0-9]+x[0-9]+\]')?.[0]?.slice(1, -1);

    let size = allowedSizes[0];
    let prompt = args;
    
    if (providedSize) {
        prompt = args.replace(`[${providedSize}]`, '').trim();
        const [w, h] = providedSize.split('x').map(v => +v);
        // telegram rules
        if ((w > h ? w / h : h / w) <= 20 && w + h <= 10000 && allowedSizes.includes(providedSize)) {
            size = providedSize;
        }
    }

    if (!prompt) {
        return {
            type: 'error',
            text: 'Нужен промпт',
        };
    }
    let callback;

    if (interaction.platform === 'telegram') {
        interaction.ctx.replyWithChatAction('upload_photo');
        const continiousChatAction = setInterval(() => {
            interaction.ctx.replyWithChatAction('upload_photo');
        }, 5000);
    
        callback = () => {
            clearInterval(continiousChatAction);
        };
    }

    try {
        const { data } = await getImages(prompt, { size });
    
        if (!data?.[0]?.url) {
            return {
                type: 'error',
                text: 'Не получилось ничего сгенерировать, попробуй ещё',
                callback,
            };
        };
        return {
            type: 'photo',
            media: data[0].url,
            text: data[0].revised_prompt || args,
            callback,
        }
    }
    catch (err) {
        interaction.logger.error(`Failed to generate image: ${err.message}`, { error: err.stack || err });
        return {
            type: 'error',
            text: 'Неполадки с сервисом, попробу позже',
            callback,
        };
    }
};