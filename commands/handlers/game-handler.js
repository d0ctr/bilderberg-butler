const { RAWG_API_BASE, RAWG_BASE } = require('../../config.json');
const { genKey, range } = require('../utils');
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
        name: `${game.name} (${new Date(game.released).getFullYear()})`,
    })).reduce((acc, data, i) => {
        acc[i] = JSON.stringify(data);
        return acc;
    }, {});

    return redis.multi()
        .hset(`games:${key}`, data)
        .expire(`games:${key}`, 4 * 60 * 60)
        .exec();
}

/**
 * 
 * @param {string} key 
 * @param {number} start 
 * @param {number?} stop 
 * @returns {Promise<[{[number]: {url: string?, text: string, name: string, released: string}}, number] | [null]>}
 */
const getGamesFromRedis = async (key, start, stop = start + 3, except) => {
    const redis = getRedis();
    if (redis == null) {
        logger.error('Can not get game results, redis is unavailable');
        throw { message: 'Redis is unavailable' };
    }

    let indexes = range(start, stop + 1);
    if (except != null && start <= except && except <= stop) {
        if (start === 0) indexes.push(stop++);
        else indexes.push(start--);

        delete indexes[indexes.indexOf(except)];
    }

    try {
        const data = await redis.hmget(`games:${key}`, ...indexes);
        const size = await redis.hlen(`games:${key}`);
        return [
            Object.fromEntries(data
                .map((data, i) => [indexes[i], JSON.parse(data)])
                .filter(([k, v]) => v != null)),
            size
        ];
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
    const { key, ...data} = parseCallbackData(interaction.data);
    let current = data.current;
    let next = data.next;

    let start;
    let stop;
    let except = null;

    if (typeof next === 'number') {
        start = next;
        stop = start + 4;
        current = next;
    }
    else {
        const direction = next[0];
        start = parseInt(next.slice(1));

        if (direction === '>') {
            stop = start + 3;
        }
        else if (direction === '<') {
            start = start - 3 > 0 ? start - 3 : 0; 
            stop = start + 3;
        }
        except = current;
    }

    const [games, size] = await getGamesFromRedis(key, start, stop, except);
    
    let buttons = [];
    let indexes = Object.keys(games).map(v => +v);
    
    start = indexes[0];
    stop = indexes.slice(-1)[0];

    if (start > 0 && current !== 0) {
        buttons.push([{
            name: '⏫',
            callback: getCallbackData({ key, current, next: `<${start - 1}` })
        }]);
    }

    for (const i of indexes.slice(next === current ? 1 : 0, -1)) {
        buttons.push([{
            name: games[i].name,
            callback: getCallbackData({ key, current, next: i })
        }]);
    }
    
    if (stop === size - 1 && stop !== current) {
        const game = games[stop];
        buttons.push([{
            name: game.name,
            callback: getCallbackData({ key, current, next: stop})
        }]);
    }
    else if (stop + 1 < size) {
        buttons.push([{
            name: `⏬`,
            callback: getCallbackData({ key, current, next: `>${stop + 1}` })
        }]);
    }

    if (next === current) {
        return {
            type: 'edit_text',
            text: games[current].text,
            overrides: {
                link_preview_options: {
                    is_disabled: false,
                    show_above_text: true,
                    url: games[current].url
                },
                buttons,
                embeded_image: games[current].url
            }
        }
    }
    else {
        return {
            type: 'edit_buttons',
            overrides: {
                buttons
            }
        };
    }
}