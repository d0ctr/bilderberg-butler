const GrammyTypes = require('grammy');
const axios = require("axios");
const config = require("../../config.json");

/**
 * Convert definition by urban dictionary API to text HTML
 * @param {Object} definition
 * @returns {String|undefined}
 */
function urbanToHTML(definition) {
    if (!definition) {
        return;
    }
    definition.definition = _replaceWithLink(definition.definition);
    definition.example = _replaceWithLink(definition.example);

    let html = `<a href="${definition.permalink}">${definition.word}</a>

${definition.definition}

<i>${definition.example}</i>

${definition.thumbs_up} 👍|👎 ${definition.thumbs_down}`;
    return html;
}

/**
 * Replace `[arg]` with `<a href="urban dictionary/arg">arg</a>`
 * @param {String} line
 */
function _replaceWithLink(line) {
    let result = line;
    let matches = line.match(/\[[^\[\]]+\]/gm);
    for (let match of matches) {
        result = result.replace(match, `<a href="https://www.urbandictionary.com/define.php?term=${match.replace(/\[|\]/gm, '')}">${match.replace(/\[|\]/gm, '')}</a>`);
    }
    return result;
}

/**
 * Get first definition from urban dictionary
 * @param {String|undefined} word
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

/**
 * `/urban` command handler
 * @param {GrammyTypes.Context | Object} input
 * @returns {[String | null, Object | null]}
 */

async function urban(input) {
    let word = this._parseArgs(input, 1)[1];
    let definition = null;
    try {
        definition = await getUrbanDefinition(word);
    }
    catch (err) {
        this.logger.error(`Error while getting definiton from Urban Dictionary: ${err.stack || err}`, { error: err.stack || err, args: [word] });
        return [`Турбулентность по пути в Urban Disctionary, попробуйте сами: <a href="https://www.urbandictionary.com/define.php?term=${word}">ссылка</a>`];
    }
    if (!definition) {
        return [`Не может быть, Urban Dictionary не знает что это за слово\nМожешь проверить сам: <a href="https://www.urbandictionary.com/define.php?term=${word}">ссылка</a>`];
    }
    return [null, { type: 'text', text: definition }];
}

module.exports = {
    urban
}
