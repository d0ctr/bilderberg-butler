/**
 * `/gh` command handler
 * @param {GrammyTypes.Context | Object} input
 * @returns {[String | null, Object | null, null, Object]} [error, answer, null, overrides]
 */

async function gh(input) {
    let arg = this._parseArgs(input, 1)[1];
    if (!arg) {
        return ['Не хватает ссылки на GitHub'];
    }
    if (!arg.includes('github')) {
        return ['Чтобы продолжить, нужна ссылка на GitHub.\nПоддерживаются ссылки на Markdown и reStructuredText, на главные странциы репозиториев, а так же на Pull Request и Issue'];
    }
    return [null, { type: 'text', text: `<a href="https://t.me/iv?url=${arg}&rhash=8643cab1135a25"> </a><a href="${arg}">${arg}</a>`}, null, { disable_web_page_preview: false }];
}

module.exports = {
    gh,
}
