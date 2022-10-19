const {getRegex} = require("./utils");

/**
 * `/get` command handler
 * @param {GrammyTypes.Context | Object} input
 * @param {Object} interaction
 * @returns {[String | null, Object | null]} [err, message]
 */
async function get(input, interaction) {
    let name = this._parseArgs(input, 1)[1];
    if (!name) {
        return ['Ты забыл указать название гета'];
    }
    if (!name.match(getRegex)) {
        return ['Название гета может состоять только из букв латинского, русского алфавитов и цифр'];
    }
    let result = null;
    try {
        result = await interaction.redisGet(name);
    }
    catch (err) {
        this.logger.error(`Error while saving content to redis: ${err.stack}`);
        return [`Что-то случилось во время получения гета:\n<code>${err}</code>`];
    }
    if (!result) {
        return [`Такого гета нет, можешь быть первым кто его сделает`];
    }
    return [null, result];
}

/**
 * `/set` command handler
 * @param {GrammyTypes.Context | Object} input
 * @param {Object} interaction
 * @returns {[String | null, String | null]}
 */

async function set(input, interaction) {
    let name = this._parseArgs(input, 1)[1];
    if (!name) {
        return ['Ты забыл указать название гета'];
    }
    if (!name.match(getRegex)) {
        return ['Название гета может состоять только из букв латинского, русского алфавитов и цифр'];
    }
    if(!input.message.reply_to_message) {
        return ['Чтобы сохранить гет, ответьте на какое-нибудь сообщение с помощью <code>/set {название гета}</code>'];
    }

    const parsed_data = interaction._parseMessageMedia();

    if (!parsed_data.type) {
        return [`Такое сохранить не получится, сейчас поддерживаются только следующие форматы:
Простой текст, изображение, гифки, аудио, видео, документы, стикеры, голосовые и видео сообщения`];
    }

    try {
        await interaction.redisSet(name, parsed_data);
    }
    catch (err) {
        this.logger.error(`Error while saving content to redis: ${err.stack}`);
        return [`Что-то случилось во время сохранения гета:\n<code>${err}</code>`];
    }

    return [null, `Гет был сохранён, теперь его можно вызвать командой:\n<code>/get ${name}</code>${
        input.chat.id === input.from.id ? `\nТак же можешь вызвать этот гет написав <code>@BilderbergButler_bot {{/get ${name}}}</code> в поле ввода сообщения` : ''}`];
}

/**
 * `/get_list` command handler
 * @param {GrammyTypes.Context} _
 * @param {Object} interaction
 * @returns {[String | null, String | null]}
 */

async function getList(_, interaction) {
    let gets = await interaction.redisGetList();
    if (!gets.length) {
        return [`В этом чате ещё нет ни однго гета`];
    }
    return [null, `Геты доступные в этом чате:\n\n${gets.join(', ')}`, `${gets.join(', ')}`];
}

module.exports = {
    get, set, getList,
}
