const { getRedis } = require('../../services/redis');
const logger = require('../../logger').child({ module: __filename });
const ChatLLMHandler = require('../llm-handler');

const cache = {};

const AVAILABLE_MODELS_TEXT = `Доступные модели:\n${ChatLLMHandler.getModels().map(model => `- <code>${model}</code>`).join('\n')}`;

const setModel = async (id, model) => {
    cache[id] = model;

    const redis = getRedis();
    if (redis) {
        redis.set(`${id}:llm-model`, model).catch(e => logger.error('Error while setting llm-model value', { err: e.stack || e }));
    }
}

const getModel = async (id) => {
    const redis = getRedis();
    if (!(id in cache) && redis) {
        const model = await redis.get(`${id}:llm-model`).catch(() => null);
        cache[id] = model;
    }

    return cache[id];
}

const model = async (ctx) => {
    const model_name = require('./utils').parseArgs(ctx, 1)[1];
    const id = await getModel(ctx.chat.id);

    if (!model_name) {
        const current_model_name = await getModel(id);

        return [null, (current_model_name != null ? `Установленная модель: ${current_model_name}\n` : '') + AVAILABLE_MODELS_TEXT]; 
    }

    if (!(model_name in ChatLLMHandler.getModels())) {
        return [`Такой модели не существует.\n${AVAILABLE_MODELS_TEXT}`];
    }

    await setModel(id, model_name);
    return [null, 'Модель по-умолчанию установлена.'];
}

module.exports = {
    model,
    getModel,
}