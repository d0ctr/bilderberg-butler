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
    return (/** game?.background_image ? getInvisibleLink(game.background_image) : **/ '')
        + `🎮 <a href="${RAWG_BASE}/games/${game?.slug}">${game.name}</a>\n`
        + (game?.released ? `Дата релиза: ${(new Date(game.released)).toLocaleDateString('en-GB')}\n` : '' )
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

    const data = games.map(getTextFromGameDetail);

    return redis.multi()
        .rpush(key, data)
        .expire(key, 24 * 60 * 60)
        .exec();
}

const getGamesFromRedis = async (key, start, stop = start + 3 ) => {
    const redis = getRedis();
    if (redis == null) {
        logger.error('Can not get game results, redis is unavailable');
        throw { message: 'Redis is unavailable' };
    }

    try {
        const data = await redis.lrange(key, start, stop);
        return data;
    }
    catch (err) {
        logger.error(`Failed to get games details from [${key}] in range [${start}-${stop}]`, { error: err.stack || err });
        return null
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
 *  @returns {{ prefix: string, key: string, current: number, next: number }}
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
                acc.next = value;
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
            if (json.results > 0) {
                try {
                    await saveResults(json.results.slice(0, 10));
                }
                catch (err) {
                    interaction.logger('Failed to save game results', { error: err.stack || err });
                }

                buttons = json.results.slice(1, 4).map((game, next) => ({
                    name: `${game.name} (${new Date(game.released).getFullYear()})`,
                    callback: getCallbackData({ key, next })
                }));

                if (json.results.length == 5) {
                    const game = json.results[4];
                    buttons.push({
                        name: `${game.name} (${new Date(game.released).getFullYear()})`,
                        callback: getCallbackData({ key, next: 4 })
                    })
                }
                else if (json.results.length > 4) {
                    buttons.push({
                        name: '⏬',
                        callback: getCallbackData({ key, next: `>4`})
                    });
                }
            }

            return {
                type: 'text',
                text: getTextFromGameDetail(json.results[0]),
                buttons,
                overrides: {
                    link_preview_options: {
                        is_disabled: false,
                        show_above_text: true,
                        url: json.results[0]?.background_image
                    }
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