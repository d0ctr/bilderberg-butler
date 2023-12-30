const { RAWG_API_BASE, RAWG_BASE } = require('../../config.json');
const { genKey, range, encodeCallbackData, listingMenuCallback } = require('../utils');
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
        name: getNameForButton(game),
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
const getGamesFromRedis = async (key, start, stop = start + 2) => {
    const redis = getRedis();
    if (redis == null) {
        logger.error('Can not get game results, redis is unavailable');
        throw { message: 'Redis is unavailable' };
    }

    let indexes = range(start, stop + 1);

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
 * 
 * @param {{ key: string, current: number, next: string | number }} data 
 * @returns 
 */
const getCallbackData = (data) => {
    return encodeCallbackData({ prefix: 'game', ...data});
}

const getNameForButton = (game, index = null, selected = null) => {
    return `${(index != null && index === selected) ? '☑️ ' : '' }${game.name} (${new Date(game.released).getFullYear()})`
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

            try {
                await saveResults(key, json.results.slice(0, 10));
            }
            catch (err) {
                interaction.logger.error('Failed to save game results', { error: err.stack || err });
            }

            buttons = json.results.slice(0, 3).map((game, i) => ([{
                name: getNameForButton(game, i, 0),
                callback: getCallbackData({ key, current: 0, next: i })
            }]));

            if (json.results.length > 3) {
                buttons.push([{
                    name: '⏬',
                    callback: getCallbackData({ key, current: 0, next: `>3`})
                }]);
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
    return listingMenuCallback(interaction, getGamesFromRedis);
}