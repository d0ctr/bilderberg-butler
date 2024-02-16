/**
 * Sticker Command
 * @namespace sticker
 * @memberof Commands
 */

/**
 * Set Sticker Handler
 * @param {import('grammy').Context} ctx
 * @memberof Commands.sticker
 */
async function setSticker(ctx) {
    const custom_emoji_id = ctx.message.reply_to_message?.sticker?.custom_emoji_id || ctx.message.reply_to_message?.entities?.[0]?.custom_emoji_id;
    if (!custom_emoji_id) {
        return ['Отправь эту команду в ответ на кастомное эмодзи'];
    }

    let set_name;

    try {
        const result = await ctx.api.getCustomEmojiStickers([custom_emoji_id]);
        set_name = result[0].set_name;
    }
    catch (err) {
        return [`Не удалось получить набор по отправленному эмодзи\n<code>${err}</code>`];
    }

    try {
        const result = await ctx.setChatStickerSet(set_name);
        if (!result) return ['Не удалось установить эмодзи'];
    }
    catch (err) {
        return [`Не удалось установить набор эмодзи\n<code>${err}</code>`];
    }

    return [null, 'Набор эмодзи установлен как набор чата'];
}


module.exports = { setSticker };