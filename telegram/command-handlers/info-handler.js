async function info(input) {
    let message = `Информация об этом чате:
id чата: <code>${input.chat.id}</code>
тип чата: <code>${input.chat.type}</code>
${input.from.id !== input.chat.id ? `id отправителя: <code>${input.from.id}</code>` : ''}
`
    return [null, message];
}

module.exports = {
    info,
};