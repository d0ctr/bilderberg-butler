const GrammyTypes = require('grammy');

const telegram_api = new GrammyTypes.Api(process.env.TELEGRAM_TOKEN);

const { saveMessageContent } = require('../../notion');

/**
 * 
 * @param {Message} message 
 * @returns {Object}
 */
function getAuthor(message) {
    let author = {};

    if (message.forward_from) {
        author.name = message.forward_from.first_name;
        message.forward_from.last_name ? (author.name + ` ${message.forward_from.last_name}`) : null;
        author.username = message.forward_from.username;
        return author;
    }
    if (message.forward_from_chat) {
        author.title = message.forward_from_chat.title;
        author.username = message.forward_from_chat.username;
        return author;
    }
    if (message.sender_chat) {
        author.name = message.forward_from.title;
        author.username = message.sender_chat.username;
        return author;
    }
    if (message.from) {
        author.name = message.from.first_name;
        message.from.last_name ? (author.name + ` ${message.from.last_name}`) : null;
        author.username = message.from.username;
        return author;
    }
    if (message.chat) {
        author.name = message.chat.title || message.chat.first_name;
        (message.chat.first_name && message.chat.last_name) ? (author.name + ` ${message.chat.last_name}`) : null;
        author.username = message.chat.username;
        return author;
    }

    return author;
}

/**
 * Handler for notion command
 * @param {GrammyTypes.Context} input
 * @param {Object} interaction
 * @returns {[String | null, Object | null]}
 */
async function notion(input, interaction) {
    if (`${process.env.NOTION_USER_TELEGRAM_ID}` !== `${input.from.id}`
        || input.from.id !== input.chat.id) {
        // Only configured user may use
        return [];
    }

    if (!input.message.reply_to_message) {
        // Accepted only as a reply to a message
        return [];
    }

    let message_with_content = input.message.reply_to_message;
    const parsed_media = interaction._parseMessageMedia(message_with_content);

    let title = this._parseArgs(input, 1)[1];
    if (!title && parsed_media.text) {
        title = parsed_media.text.split('\n', 1)[0];
    }
    else if (!title) {
        return ['Нужен хоть какой-то текст для названия страницы, можно указать вместе с командой.\nНапример <code>/notion Крутая картинка</code>'];
    }
    const content = {
        title: title,
        text: parsed_media.text,
        entities: message_with_content.entities || message_with_content.caption_entities,
        author: getAuthor(message_with_content),
    };
    if (parsed_media.media) {
        if(['photo, video, audio'].includes(parsed_media.type)) {
            content.file_type = parsed_media.type;
        }
        else if (content.media) {
            content.file_type = 'file';
        }
        try {
            let url = `${process.env.DOMAIN}/telegramfile/`;
            const file = await telegram_api.getFile(parsed_media.media);
            content.file_url = url + file.file_path;
        }
        catch (err) {
            this.logger.error(`Error while getting [File:${parsed_media.file_id}]: ${err.stack || err}`, { error: err.stack || err });
        }
    }

    return [null, `<code>${JSON.stringify(content, null, 2)}</code>`];
}

module.exports = {
    notion
};