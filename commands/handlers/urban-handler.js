const axios = require('axios');

const config = require('../../config.json');

/**
 * Convert urban_definition by urban dictionary API to text HTML
 * @param {Object} urban_definition
 * @returns {String | undefined}
 */
function urbanToHTML(urban_definition) {
    if (!urban_definition) {
        return;
    }
    urban_definition.definition = replaceWithLink(urban_definition.definition);
    urban_definition.example = replaceWithLink(urban_definition.example);

    let html = `<a href="${urban_definition.permalink}">${urban_definition.word}</a>

${urban_definition.definition}

<i>${urban_definition.example}</i>

${urban_definition.thumbs_up} 👍|👎 ${urban_definition.thumbs_down}`;

    return html;
}

/**
 * Replace `[arg]` with `<a href="urban dictionary/arg">arg</a>`
 * @param {String} line
 */
function replaceWithLink(line) {
    let result = line;
    let matches = line.match(/\[[^\[\]]+\]/gm);
    for (let match of matches) {
        result = result.replace(match, `<a href="${encodeURI(`https://www.urbandictionary.com/define.php?term=${match.replace(/\[|\]/gm, '')}`)}">${match.replace(/\[|\]/gm, '')}</a>`);
    }
    return result;
}

/**
 * Get first definition from urban dictionary
 * @param {String | undefined} word
 * @returns {Promise<String|null>}
 */
async function getUrbanDefinition(word) {
    let result = null;
    let endpoint = 'define';
    if (!word) {
        endpoint = 'random';
    }
    let urban_req = await axios.get(`${config.URBAN_API}/${endpoint}`, { params: { term: `${word}` } });
    if (urban_req.status !== 200) {
        return result;
    }

    result = urban_req.data?.list[0];

    return urbanToHTML(result);
}

const definition = {
    command_name: 'urban',
    args: [
        {
            name: 'phrase',
            type: 'string',
            description: 'Фраза для поиска в Urban Dictionary.',
            optional: true
        }
    ],
    limit: 1,
    description: 'Возвращает определение для фразы из Urban Dictionary.'
};

const condition = config.URBAN_API || false;

/**
 * `/urban` command handler
 * @param {Object} interaction
 * @returns {[String | null, Object | null]}
 */

async function handler(interaction) {
    const phrase = interaction.args && interaction.args[0];

    let urban_definition = null;

    try {
        urban_definition = await getUrbanDefinition(phrase);
    }
    catch (err) {
        interaction.logger.error(`Error while getting definiton from Urban Dictionary`, { error: err.stack || err });
        return {
            type: 'error',
            text: `Турбулентность по пути в Urban Disctionary, попробуйте сами: <a href="${encodeURI(`https://www.urbandictionary.com/define.php?term=${phrase}`)}">ссылка</a>`
        };
    }

    if (!urban_definition) {
        return {
            type: 'error',
            text: `Не может быть, Urban Dictionary не знает что это за слово\nМожешь проверить сам: <a href="${encodeURI(`https://www.urbandictionary.com/define.php?term=${phrase}`)}">ссылка</a>`
        };
    }

    return {
        type: 'text',
        text: urban_definition
    };
}

module.exports = {
    handler,
    definition,
    condition
}
