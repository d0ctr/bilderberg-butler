const { getRedis } = require('../../services/redis');
const logger = require('../../logger').child({ module: __filename })

const cache = {};

const onMessage  = 'Автоответ включён. Бот будет автоматичеси отвечать на все личные сообщения.',
      offMessage = 'Автоответ выключен. Для использования нейросетей, пользуйтесь командой /answer.';

const getMessage = {
    true:  onMessage,
    false: offMessage
};

const setAutoreply = async (id, on = false) => {
    cache[id] = !!on;
    
    const redis = getRedis();
    if (redis) {
        redis.set(`${id}:autoreply`, on).catch(e => logger.error('Error while setting autoreply value', { err: e.stack || e }));
    }
}

const isAutoreplyOn = async (id) => {
    const redis = getRedis();
    if (!(id in cache) && redis) {
        const state = await redis.get(`${id}:autoreply`).then(v => v !== 'false').catch(() => true);
        cache[id] = state;
    }
    
    return !!cache[id];
}

async function toggleAutoreply(id) {
    let state;
    return isAutoreplyOn(id).then(v => (state = !v, setAutoreply(id, !v))).then(() => state).catch(() => null);
}

async function toggleAutoreplyHandler(ctx) {
    if (ctx.chat?.id !== ctx.from?.id) return ['Автоответ доступен только в личных сообщениях.'];

    const state = await toggleAutoreply(ctx.chat.id);
    return [null, getMessage[state]];
}

function setAutoreplyHandler(on = false) {
    return async (ctx) => {
        if (ctx.chat?.id !== ctx.from?.id) return ['Автоответ доступен только в личных сообщениях.'];
    
        await setAutoreply(ctx.chat.id, on);
        return [null, getMessage[on]];
    }
}

module.exports = {
    toggleAutoreplyHandler,
    setAutoreplyHandler,
    isAutoreplyOn,
}