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
const getReleasesFromRAWG = async ({ year = new Date(Date.now()).getFullYear(), month = new Date(Date.now()).getMonth(), size = 25, ...args } = {}) => {
    return await fetch(
        `${RAWG_API_BASE}/games/calendar/${year}/${month}?`
        + new URLSearchParams({
            key: process.env.RAWG_TOKEN,
            // for some reason 'added' is the popularity ordering, where the top of '-added' is the most popular
            ordering: '-added',
            popular: 'true',
            page_size: size,
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
 * @param {{name: string, slug: string, released: string}[]} list List of game details
 * @returns {string}
 * @memberof Commands.releases
 */
const transformReleasesList = (list) => {
    return list
        // need to sort by date, since ordered by popilarity
        .sort((a, b) => a.released.split('-')[2] - b.released.split('-')[2])
        .reduce((acc, game) => acc += `${getTextFromGameDetail(game)}`, 'Релизы:\n');
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
            optional: true
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
    
    let year, month;

    if (!arg?.match(/\d{4}-\d{1,2}/)?.length) {
        // use current date instead
        // return {
        //     type: 'error',
        //     text: 'Для запроса нужно предоставить дату, например <code>2008-07</code>.'
        // }
        const date = new Date(Date.now());
        [year, month] = [date.getFullYear(), date.getMonth()];
    }
    else {
        [[_, year, month]] = [...arg.matchAll(/(?<year>\d{4})-(?<month>\d{1,2})/g)];
    }


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
