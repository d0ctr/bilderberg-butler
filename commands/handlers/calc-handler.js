const mathjs = require("mathjs");

const definition = {
    command_name: 'calc',
    args: [
        {
            name: 'math_line',
            type: 'string',
            description: 'Математическое выражение.'
        }
    ],
    limit: 1,
    description: 'Возвращает результат переданного математического выражения.',
    is_inline: true,
};

const condition = true;

/**
 * `/calc` command handler
 * @param {Object} interaction
 * @returns {Object} 
 */
async function handler(interaction) {
    const math_line = interaction.args && interaction.args[0];

    if (!math_line) {
        return {
            type: 'error',
            text: 'Напиши хоть что-нибудь, типа: 1+1'
        };
    }
    let result = null;
    try {
        result = `${math_line} = ${mathjs.evaluate(math_line)}`;
    }
    catch (err) {
        interaction.logger.error(`Error while calculating`, { error: err.stack || err });
        return {
            type: 'error',
            text: 'Что-то ты не то написал, этой командой можно считать только математические выражения'
        };
    }
    return {
        type: 'text',
        text: result
    };
}

module.exports = {
    handler,
    definition,
    condition
}
