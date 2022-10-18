/**
 * `/get` command handler
 * @param {GrammyTypes.Context | Object} input
 * @param {Object} interaction
 * @returns {[String | null, Object | null]}
 */
const {getRegex} = require("./utils");

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

    let parsed_data = {};

    if (input.message.reply_to_message.animation) {
        if (input.message.reply_to_message.caption) {
            parsed_data.text = input.message.reply_to_message.caption;
        }
        parsed_data.animation = input.message.reply_to_message.animation.file_id;
        parsed_data.type = 'animation';
    }
    else if (input.message.reply_to_message.audio) {
        if (input.message.reply_to_message.caption) {
            parsed_data.text = input.message.reply_to_message.caption;
        }
        parsed_data.audio = input.message.reply_to_message.audio.file_id;
        parsed_data.type = 'audio';
    }
    else if (input.message.reply_to_message.document) {
        if (input.message.reply_to_message.caption) {
            parsed_data.text = input.message.reply_to_message.caption;
        }
        parsed_data.document = input.message.reply_to_message.document.file_id;
        parsed_data.type = 'document';
    }
    else if (input.message.reply_to_message.video) {
        if (input.message.reply_to_message.caption) {
            parsed_data.text = input.message.reply_to_message.caption;
        }
        parsed_data.video = input.message.reply_to_message.video.file_id;
        parsed_data.type = 'video';
    }
    else if (input.message.reply_to_message.video_note) {
        if (input.message.reply_to_message.caption) {
            parsed_data.text = input.message.reply_to_message.caption;
        }
        parsed_data.video_note = input.message.reply_to_message.video_note.file_id;
        parsed_data.type = 'video_note';
    }
    else if (input.message.reply_to_message.voice) {
        if (input.message.reply_to_message.caption) {
            parsed_data.text = input.message.reply_to_message.caption;
        }
        parsed_data.voice = input.message.reply_to_message.voice.file_id;
        parsed_data.type = 'voice';
    }
    else if (input.message.reply_to_message.sticker) {
        if (input.message.reply_to_message.caption) {
            parsed_data.text = input.message.reply_to_message.caption;
        }
        parsed_data.sticker = input.message.reply_to_message.sticker.file_id;
        parsed_data.type = 'sticker';
    }
    else if (input.message.reply_to_message.photo) {
        if (input.message.reply_to_message.caption) {
            parsed_data.text = input.message.reply_to_message.caption;
        }
        parsed_data.photo = input.message.reply_to_message.photo[0].file_id;
        parsed_data.type = 'photo';
    }
    else if (input.message.reply_to_message.text) {
        parsed_data.text = input.message.reply_to_message.text;
        parsed_data.type = 'text';
    }
    else {
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
