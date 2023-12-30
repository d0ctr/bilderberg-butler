const { RAWG_API_BASE, RAWG_BASE } = require('../../config.json');
const { getInvisibleLink, genKey } = require('../utils');
const { getRedis } = require('../../services/redis');
const logger = require('../../logger').child({ module: 'game-handler' });

const getGamesFromRAWG = async ({ search, ...args } = {}) => {
    return await fetch(
        `${RAWG_API_BASE}/games?`
        + new URLSearchParams({
            key: process.env.RAWG_TOKEN,
            search,
            page_size: 10,
            ...args
        }));
}

const getTextFromGameDetail = (game) => {
    return `🎮 <a href="${RAWG_BASE}/games/${game?.slug}">${game.name}</a>\n`
        + (game?.released ? `Дата релиза: ${(new Date(game.released)).toLocaleDateString('de-DE')}\n` : '' )
        + (game?.metacritic ? `Metacritic: ${game.metacritic}\n` : '')
        + (game?.playtime ? `Среднее время прохождения: ${game.playtime} часов\n` : '')
        + (game?.platforms?.length ? `Платформы: ${game.platforms.filter(v => v.platform?.name).map(v => v?.platform.name).join(', ')}\n` : '')
        + (game?.stores?.length ? `Магазины: ${game.stores.filter(v => v?.store?.name).map(v => v.store.name).join(', ')}\n` : '');
}

/**
 * Save RAWG.io results in redis for quick access
 * @param {{}[]} games 
 */
const saveResults = async (key, games) => {
    const redis = getRedis();
    if (redis == null) {
        logger.error('Can not save game results, redis is unavailable');
        throw { message: 'Redis is unavailable' };
    }

    const data = games.map(game => ({
        text: getTextFromGameDetail(game),
        url: game.background_image,
        name: game.name,
        released: game.released
    })).map(data => JSON.stringify(data));

    return redis.multi()
        .rpush(`games:${key}`, data)
        .expire(`games:${key}`, 24 * 60 * 60)
        .exec();
}

/**
 * 
 * @param {string} key 
 * @param {number} start 
 * @param {number?} stop 
 * @returns {Promise<[{url: string?, text: string, name: string, released: string}[], number] | [null]>}
 */
const getGamesFromRedis = async (key, start, stop = start + 4 ) => {
    const redis = getRedis();
    if (redis == null) {
        logger.error('Can not get game results, redis is unavailable');
        throw { message: 'Redis is unavailable' };
    }

    try {
        const data = await redis.lrange(`games:${key}`, start, stop);
        const size = await redis.llen(`games:${key}`);
        return [data.map(data => JSON.parse(data)), size];
    }
    catch (err) {
        logger.error(`Failed to get games details from [${key}] in range [${start}-${stop}]`, { error: err.stack || err });
        return [null];
    }
}

/**
 * Generate callback data of the form `prefix:key:current:next`
 * @param {{ prefix: string?, key: string, current: number?, next: number | string }}
 */
const getCallbackData = ({ prefix = exports.definition.command_name, key, current = 0, next }) => {
    return `${prefix}:${key}:${current}:${next}`;
}

/**
 * 
 * @param {'prefix:key:current:next'} data
 *  @returns {{ prefix: string, key: string, current: number, next: number | string }}
 */
const parseCallbackData = (data) => {
    return data.split(':').reduce((acc, value, i) => {
        switch(i) {
            case 0:
                acc.prefix = value;
                break;
            case 1:
                acc.key = value;
                break;
            case 2:
                acc.current = parseInt(value);
                break
            case 3:
                acc.next = ['<', '>'].includes(value[0]) ? value : parseInt(value);
                break;
        }
        return acc;
    }, {});
}

exports.definition = {
    command_name: 'game',
    args: [
        {
            name: 'query',
            type: 'string',
            description: 'Название для поиска в RAWG.io',
            optional: false
        }
    ],
    limit: 1,
    is_inline: true,
    description: 'Возваращет краткую информацию по игре из RAWG.io'
};

exports.condition = !!process.env.RAWG_TOKEN;

/**
 * 
 * @param {import('../utils').Interaction} interaction 
 * @returns 
 */
exports.handler = async (interaction) => {
    const args = interaction.args?.[0];
    
    if (!args) {
        return {
            type: 'error',
            text: 'Для запроса нужно предоставить название, например <code>Alan Wake</code>.'
        }
    }

    return getGamesFromRAWG({ search: args })
        .then(async (res) => {
            interaction.logger.silly(`Received response from RAWG/games`);
            if (!res.ok) {
                interaction.logger.error(`Non-200 response from RAWG [status:${res.status}] [statusText:${res.statusText}]`, { api_response: JSON.stringify(res) });
                return {
                    type: 'error',
                    text: 'Что-то не задалось с поиском, попробуй ещё раз'
                };
            }
            const json = await res.json();
            if (!json?.results?.length) {
                return {
                    type: 'error',
                    text: 'Не смог ничего найти, попробуй другой запрос'
                };
            }

            const key = genKey();

            let buttons = null;
            if (json.results.length > 0) {
                try {
                    await saveResults(key, json.results.slice(0, 10));
                }
                catch (err) {
                    interaction.logger.error('Failed to save game results', { error: err.stack || err });
                }

                buttons = json.results.slice(1, 4).map((game, i) => ([{
                    name: `${game.name} (${new Date(game.released).getFullYear()})`,
                    callback: getCallbackData({ key, next: i + 1 })
                }]));

                if (json.results.length == 5) {
                    const game = json.results[4];
                    buttons.push([{
                        name: `${game.name} (${new Date(game.released).getFullYear()})`,
                        callback: getCallbackData({ key, next: 4 })
                    }])
                }
                else if (json.results.length > 4) {
                    buttons.push([{
                        name: '⏬',
                        callback: getCallbackData({ key, next: `>4`})
                    }]);
                }
            }

            return {
                type: 'text',
                text: getTextFromGameDetail(json.results[0]),
                overrides: {
                    link_preview_options: {
                        is_disabled: false,
                        show_above_text: true,
                        url: json.results[0]?.background_image,
                    },
                    buttons,
                    embeded_image: json.results[0]?.background_image,
                }
            };
        })
        .catch((err) => {
            interaction.logger.error(`Error while getting game details from RAWG`, { error: err.stack || err});
            return {
                type: 'error',
                text: 'Что-то у меня поломалось, можешь попробовать ещё раз'
            };
        });
};

/**
 * 
 * @param {import('../utils').Interaction} interaction 
 */
exports.callback = async (interaction) => {
    const { key, current, next} = parseCallbackData(interaction.data);
    
    if (typeof next === 'number') {
        const [games, size] = await getGamesFromRedis(key, next);

        if (games === null) {
            return {
                type: 'error',
                text: 'Невозможно выполнить этот запрос, попробуйте другой'
            };
        }

        let buttons = [];

        if (next !== 0) {
            buttons.push([{
                name: '⏫',
                callback: getCallbackData({ key, current: next, next: `<${next - 1}` })
            }]);
        }

        if (games.length) {
            buttons.push(...games.slice(1, 4).map((game, i) => ([{
                name: `${game.name} (${new Date(game.released).getFullYear()})`,
                callback: getCallbackData({ key, current: next, next: i + next + 1})
            }])))
        }

        if (games.length > 4 && games.length + next === size) {
            const game = games.slice(-1)[0];
            buttons.push([{
                name: `${game.name} (${new Date(game.released).getFullYear()})`,
                callback: getCallbackData({ key, current: next, next: size - 1})
            }]);
        }
        else if (games.length !== 0 && games.length < size - next) {
            buttons.push([{
                name: `⏬`,
                callback: getCallbackData({ key, current: next, next: `>${games.length + next - 1}` })
            }]);
        }

        return {
            type: 'edit_text',
            text: games[0].text,
            overrides: {
                link_preview_options: {
                    is_disabled: false,
                    show_above_text: true,
                    url: games[0].url
                },
                buttons,
                embeded_image: games[0].url
            }
        }
    }
    else {
        const direction = next[0];
        let start = parseInt(next.slice(1));

        const buttons = [];
        let games = null;
        let size;

        let stop;

        if (direction === '>') {
            stop = start + 2;
        }
        else if (direction === '<') {
            start = start - 2 > 0 ? start - 2 : 0; 
            stop = start + 2;
        }

        if (start > current || stop < current) {
            ([games, size] = await getGamesFromRedis(key, start, stop));
        }
        else if (start === 0) {
            stop++;
            ([games, size] = await getGamesFromRedis(key, start, stop));
            games = games.map((v, i) => ((i + start) !== current) ? v : null)
        }
        else {
            start--;
            ([games, size] = await getGamesFromRedis(key, start, stop));
            games = games.map((v, i) => ((i + start) !== current) ? v : null)
        }

        if (games == null) {
            return {
                type: 'error',
                text: 'Невозможно выполнить этот запрос, попробуйте другой'
            };
        }

        if (start !== 0 && (start < current || start > current)) {
            buttons.push([{
                name: '⏫',
                callback: getCallbackData({ key, current, next: `<${start - 1}`})
            }]);
        }
        if (games.length) {
            buttons.push(...games.slice(0, 4).map((game, i) => game != null ? ([{
                name: `${game.name} (${new Date(game.released).getFullYear()})`,
                callback: getCallbackData({ key, current, next: start + i })
            }]) : [null]))
        }
        // if (stop !== current && stop === size - 1 && games[stop - start + 1] !== null) {
        //     const game = games.slice(-1)[0];
        //     buttons.push([{
        //         name: `${game.name} (${new Date(game.released).getFullYear()})`,
        //         callback: getCallbackData({ key, current, next: stop })
        //     }])
        // }
        if (stop + 1 < size && current !== size - 1) {
            buttons.push([{
                name: '⏬',
                callback: getCallbackData({ key, current, next: `>${stop + 1}`})
            }]);
        }

        return {
            type: 'edit_buttons',
            overrides: {
                buttons
            }
        };
    }
}