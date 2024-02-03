const { RAWG_API_BASE, RAWG_BASE } = require('../../config.json');

/**
 * Releases Command
 * @namespace releases
 * @memberof Commands
 */

/**
 * Get list of releases
 * @param {{year: number, month: number, ...args}} - Request parameters 
 * @returns {{name: string, slug: string, released: string}[]}
 * @memberof Commands.releases
 */
const getReleasesFromRAWG = async ({ year = new Date(Date.now()).getFullYear(), month = new Date(Date.now()).getMonth(), ...args } = {}) => {
    return await fetch(
        `${RAWG_API_BASE}/games/calendar/${year}/${month}?`
        + new URLSearchParams({
            key: process.env.RAWG_TOKEN,
            ordering: '-released',
            popular: 'true',
            page_size: 25,
            ...args
        }));
}

/**
 * Tranform game release details to text
 * @param {{name: string, slug: string, released: string}} game Game details
 * @returns {string}
 * @memberof Commands.releases
 */
const getTextFromGameDetail = (game) => {
    return `\t• <a href="${RAWG_BASE}/games/${game?.slug}">${game.name}</a>`
        + (game?.released ? ` — ${(new Date(game.released)).toLocaleDateString('ru-RU')}` : '' )
        + '\n';
}

/**
 * Transform a list of game release detail to a single text
 * @param {string[]} list List of game details
 * @returns {string}
 * @memberof Commands.releases
 */
const transformReleasesList = (list) => {
    return list.reduce((acc, game) => acc += `${getTextFromGameDetail(game)}`, 'Релизы:\n');
}

/**
 * @type {Common.CommandDefintion}
 * @memberof Commands.releases
 */
exports.definition = {
    command_name: 'releases',
    args: [
        {
            name: 'query',
            type: 'string',
            description: 'Дата в формате год-месяц, например 2008-07',
            optional: false
        }
    ],
    limit: 1,
    is_inline: true,
    description: 'Возвраащет список релизов из RAWG.io'
};
/**
 * @type {boolean}
 * @memberof Commands.releases
 */
exports.condition = !!process.env.RAWG_TOKEN;

/**
 * @type {Common.CommandHandler}
 * @memberof Commands.releases
 */
exports.handler = async (interaction) => {
    const arg = interaction.args?.[0];
    
    if (!arg?.match(/\d{4}-\d{1,2}/)?.length) {
        return {
            type: 'error',
            text: 'Для запроса нужно предоставить дату, например <code>2008-07</code>.'
        }
    }

    const [[{}, year, month]] = [...arg.matchAll(/(?<year>\d{4})-(?<month>\d{1,2})/g)];

    return getReleasesFromRAWG({ year, month })
        .then(async (res) => {
            interaction.logger.silly(`Received response from RAWG/games/calendar`);
            if (!res.ok) {
                interaction.logger.error(`Non-200 response from RAWG [status:${res.status}] [statusText:${res.statusText}]`, { api_response: JSON.stringify(res)});
                return {
                    type: 'error',
                    text: 'Что-то не задалось с поиском, попробуй ещё раз'
                };
            }
            let json = await res.json();
            if (!json?.results?.length) {
                return {
                    type: 'error',
                    text: 'Не смог ничего найти, попробуй другой запрос'
                };
            }

            const releases = [...json.results];

            // list can be too long, limitting to 30 items with page_size query param
            // while (json?.next) {
            //     const next = await fetch(json.next);
            //     if (!next.ok) break;
            //     json = await next.json();
            //     if (!json?.results?.length) break;
            //     releases.push(...json.results);
            // }

            return {
                type: 'text',
                text: transformReleasesList(releases),
                overrides: {
                    followup: { text: 'Полный список', url: `${RAWG_BASE}/video-game-releases/${year}-${month}` }
                }
            };
        })
        .catch((err) => {
            interaction.logger.error(`Error while getting release calendar from RAWG`, { error: err.stack || err});
            throw err;
        });
};
