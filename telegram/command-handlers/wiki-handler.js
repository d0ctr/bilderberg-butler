const axios = require('axios');
const config = require('../../config.json');
const GrammyTypes = require('grammy');
const {russianAlphabetRegex} = require("./utils");

async function getWikipediaSummary(queryResult, locale) {
    let result = null;

    if (!queryResult || !locale) {
        return result;
    }

    let res = await axios.get(
        `${config.WIKIPEDIA_SUMMARY_URL[locale]}/${queryResult[1].split('/').pop()}`
    );

    if (res.status !== 200) {
        return result;
    }

    if (!res.data || !res.data.extract) {
        return result;
    }

    result = `<a href="${queryResult[1]}">${queryResult[0]}</a>\n\n${res.data.extract}`;

    return result;
}

async function searchWikipedia(query, locale = null) {
    let result = null;
    if (!query) {
        return null;
    }

    if (!locale) {
        locale = query.match(russianAlphabetRegex) ? 'RU' : 'EN';
    }

    let res = await axios.get(
        config.WIKIPEDIA_SEARCH_URL[locale],
        {
            params: {
                action: 'opensearch',
                format: 'json',
                search: `${query}`,
                limit: 1
            }
        }
    );

    if (res.status !== 200) {
        return result;
    }

    if (!res.data || !res.data.length || res.data.length < 4 || !res.data[1].length || !res.data[3].length) {
        if (locale === 'RU') {
            return searchWikipedia(query, 'EN');
        }
        return result;
    }

    result = res.data.flat();

    result = [result[1], result[3]];

    return await getWikipediaSummary(result, locale);
}

/**
 * `/wiki` command handler
 * @param {GrammyTypes.Context | Object} input
 * @returns {[null, Object | null, null, Object | null]} [null, answer, null, overrides]
 */
async function wiki(input) {
    let arg = this._parseArgs(input, 1)[1];
    if (!arg) {
        return ['Напиши что искать, например <code>/wiki Википедия</code>'];
    }

    let wikisearch = await searchWikipedia(arg);
    if (!wikisearch) {
        return ["Я не смог справится с поиском, видимо спасёт только гугл"];
    }
    return [null, wikisearch, null, { disable_web_page_preview: false }];
}

module.exports = {
    wiki,
}
