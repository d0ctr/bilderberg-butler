/**
 * GitHub Command
 * @namespace gh
 * @memberof Commands
 */

/**
 * GitHub Command Handler
 * @param {import('grammy').Context} ctx
 * @memberof Commands.gh
 */
async function gh(ctx) {
    let arg = require('./utils').parseArgs(ctx, 1)[1];
    if (!arg) {
        return ['Не хватает ссылки на GitHub'];
    }
    if (!arg.includes('github')) {
        return ['Чтобы продолжить, нужна ссылка на GitHub.\nПоддерживаются ссылки на Markdown и reStructuredText, на главные странциы репозиториев, а так же на Pull Request и Issue'];
    }
    return [
        null, 
        { type: 'text', text: `<a href="${arg}">${arg}</a>` },
        null, 
        {
            link_preview_options: 
            {
                is_disabled: false,
                show_above_text: false,
                url: `https://t.me/iv?url=$%7Barg%7D&rhash=8643cab1135a25`,
            }, 
        }
    ];
}

module.exports = {
    gh,
}
