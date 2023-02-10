const definition = {
    command_name: '0o0',
    args: [
        {
            name: 'phrase',
            type: 'string',
            description: 'Фраза.'
        }
    ],
    limit: 1,
    description: 'Конвертирует фразу в ФрАзУ',
    is_inline: true,
}

const condition = true;

async function handler(interaction) {
    const phrase = interaction.args && interaction.args[0];

    if (!phrase) {
        return {
            type: 'error',
            text: 'Нужна хоть какая-нибудь фраза'
        };
    }

    let result = `${phrase}`
        .toLowerCase()
        .split('')
        .map((char, index) => index % 2 === 0 ? char.toUpperCase() : char)
        .join('');

    return {
        type: 'text',
        text: result
    }

}

module.exports = {
    definition,
    condition,
    handler
}