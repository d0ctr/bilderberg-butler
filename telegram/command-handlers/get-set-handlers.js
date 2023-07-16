const getRegex = /^[a-zA-Zа-яА-Я0-9_-]+$/g;

async function redisGet(ctx, name) {
    const redis = require('../../services/redis').getRedis();
    if (!redis) {
        throw new Error('Storage is offline');
    }
    let key = `${ctx.chat?.id || ctx.from.id}:get:${name}`;
    let result = await redis.hgetall(key);
    return result.data ? JSON.parse(result.data) : result; // legacy support for not stringified get-s
}

async function redisSet(ctx, name, data) {
    const redis = require('../../services/redis').getRedis();
    if (!redis) {
        throw new Error('Storage is offline');
    }
    let key = `${ctx.chat.id || ctx.from.id}:get:${name}`;
    for (let i in data) {
        if (!data[i]) {
            delete data[i];
        }
    }
    if (!Object.keys(data).length) {
        throw new Error('Cannot save empty data');
    }

    let owner;

    if (ctx.chat.id !== ctx.from.id) {
        owner = ctx.from.id;
    }

    if (await redis.exists(key)) {
        throw new Error('This key already exists');
    }

    return redis.hset(key, { data: JSON.stringify(data), owner });
}

async function redisGetList(ctx) {
    const redis = require('../../services/redis').getRedis();
    if (!redis) {
        throw new Error('Storage is offline');
    }
    let key = `${ctx.chat?.id || ctx.from.id}:get:*`;
    let r_keys = await redis.keys(key);
    let keys = [];
    for (let r_key of r_keys) {
        keys.push(r_key.split(':').slice(-1)[0]);
    }
    return keys;
}

async function redisDel(ctx, name) {
    const redis = require('../../services/redis').getRedis();
    if (!redis) {
        throw new Error('Storage is offline');
    }

    let key = `${ctx.chat?.id || ctx.from.id}:get:${name}`;

    if (!await redis.exists(key)) {
        throw new Error('No such key');
    }

    let owner_id = await redis.hget(key, 'owner');

    if (owner_id && `${owner_id}` !== `${ctx.from.id}`) {
        throw new Error('Can be deleted only by the owner');
    }

    await redis.del(key);
}

/**
 * `/get` command handler
 * @param {GrammyTypes.Context | Object} ctx
 * @returns {[String | null, Object | null]} [err, message]
 */
async function get(ctx) {
    let name = this._parseArgs(ctx, 1)[1];
    if (!name) {
        return ['Ты забыл указать название гета'];
    }
    if (!name.match(getRegex)) {
        return ['Название гета может состоять только из букв латинского, русского алфавитов, цифр и символов -, _'];
    }
    let result = null;
    try {
        result = await redisGet(ctx, name);
    }
    catch (err) {
        this.logger.error(`Error while getting content from redis`, { error: err.stack || err, args: [name] });
        return [`Что-то случилось во время получения гета:\n<code>${err}</code>`];
    }
    if (!result || !Object.keys(result).length) {
        return [`Такого гета нет, можешь быть первым кто его сделает`];
    }
    return [null, result];
}

/**
 * `/set` command handler
 * @param {GrammyTypes.Context | Object} ctx
 * @param {Object} interaction
 * @returns {[String | null, String | null]}
 */

async function set(ctx, interaction) {
    let name = this._parseArgs(ctx, 1)[1];
    if (!name) {
        return ['Ты забыл указать название гета'];
    }
    if (!name.match(getRegex)) {
        return ['Название гета может состоять только из букв латинского, русского алфавитов, цифр и символов -, _'];
    }
    if (!ctx.message.reply_to_message) {
        return ['Чтобы сохранить гет, ответьте на какое-нибудь сообщение с помощью <code>/set {название гета}</code>'];
    }

    const parsed_data = interaction._parseMessageMedia(ctx.message.reply_to_message);

    if (!parsed_data.type) {
        return [`Такое сохранить не получится, сейчас поддерживаются только следующие форматы:
Простой текст, изображение, гифки, аудио, видео, документы, стикеры, голосовые и видео сообщения`];
    }

    try {
        await redisSet(ctx, name, parsed_data);
    }
    catch (err) {
        this.logger.error(`Error while saving content to redis`,{ error: err.stack || err, args: [name], parsed_data });
        return [`Что-то случилось во время сохранения гета:\n<code>${err}</code>`];
    }

    return [null, `Гет был сохранён, теперь его можно вызвать командой:\n<code>/get ${name}</code>${
        ctx.chat.id === ctx.from.id ? `\nТак же можешь вызвать этот гет написав <code>@${ctx.me.username} /get ${name}</code> в поле ввода сообщения` : ''}`];
}

/**
 * `/get_list` command handler
 * @param {GrammyTypes.Context} ctx
 * @returns {[String | null, String | null]}
 */

async function getList(ctx) {
    let gets;
    try {
        gets = await redisGetList(ctx);
    }
    catch (err) {
        this.logger.error(`Error while getting list from redis`,{ error: err.stack || err });
        return [`Что-то случилось во время получения списка гетов:\n<code>${err}</code>`];
    }
    if (!gets?.length) {
        return [`В этом чате ещё нет ни однго гета`];
    }
    return [null, `Геты доступные в этом чате:\n\n${gets.join(', ')}`, `${gets.join(', ')}`];
}

/**
 * `/del` command handler
 * @param {GrammyTypes.Context} ctx
 * @returns {[String | null, String | null]}
 */
async function del(ctx) {
    let name = this._parseArgs(ctx, 1)[1];
    if (!name) {
        return ['Ты забыл указать название гета'];
    }

    try {
        await redisDel(ctx, name);
    }
    catch (err) {
        this.logger.error(`Error while deleting data from redis`,{ error: err.stack || err, args: [name] });
        return [`Что-то случилось во время удаления гета:\n<code>${err}</code>`];
    }

    return [null, `Гет <b>${name}</b> успешно удалён`];
}

module.exports = {
    get, set, getList, del
}
