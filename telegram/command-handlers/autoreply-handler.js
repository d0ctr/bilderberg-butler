const { getRedis } = require('../../services/redis');

const backup = {};

const onMessage  = 'Автоответ включён. Бот будет автоматичеси отвечать на все личные сообщения.',
      offMessage = 'Автоответ выключен. Для использования нейросетей, пользуйтесь командой /answer.';

const getMessage = (state) => state === true ? onMessage : offMessage;

const setAutoreply = async (id, on = false) => {
    const redis = getRedis();
    if (!redis) {
        backup[id] = !!on;
        return;
    }

    await redis.set(`${id}:autoreply`, on);
}

const isAutoreply = async (id) => {
    const redis = getRedis();
    if (!redis) {
        return !!backup[id];
    }

    return redis.get(`${id}:autoreply`).then(v => v !== 'false').catch(() => null);
}

async function toggleAutoreply(id) {
    let state;
    return isAutoreply(id).then(v => (state = !v, setAutoreply(id, !v))).then(() => state).catch(() => null);
}

async function toggleAutoreplyHandler(ctx) {
    if (ctx.chat?.id !== ctx.from?.id) return ['Автоответ доступен только в личных сообщениях.'];

    const state = await toggleAutoreply(ctx.chat.id);
    return [null, getMessage(state)];
}

function setAutoreplyHandler(on = false) {
    return async (ctx) => {
        if (ctx.chat?.id !== ctx.from?.id) return ['Автоответ доступен только в личных сообщениях.'];
    
        await setAutoreply(ctx.chat.id, on);
        return [null, getMessage(on)];
    }
}

module.exports = {
    toggleAutoreplyHandler,
    setAutoreplyHandler,
    isAutoreply,
}