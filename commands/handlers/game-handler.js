const { RAWG_API_BASE, RAWG_BASE } = require('../../config.json');

const getGamesFromRAWG = async ({ search, ...args } = {}) => {
    return await fetch(
        `${RAWG_API_BASE}/games?`
        + new URLSearchParams({
            key: process.env.RAWG_TOKEN,
            search,
            ...args
        }));
}

const getTextFromGameDetail = (game) => {
    return `🎮 <a href="${RAWG_BASE}/games/${game?.slug}">${game.name}</a>\n`
        + `${game?.released && `Дата релиза: ${(new Date(game.released)).toLocaleDateString('ru-RU')}`}\n`
        + `${game?.metacritic && `Metacritic: ${game.metacritic}`}\n`
        + `${game?.platforms?.length && `Платформы: ${game.platforms.filter(v => v.platform?.name).map(v => v?.platform.name).join(', ')}`}`;
}

const transformGameDetails = (game) => {
    return game?.background_image ? 
        {
            type: 'photo',
            media: game.background_image,
            text: getTextFromGameDetail(game)
        } :
        {
            type: 'text',
            text: getTextFromGameDetail(game)
        }
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
            interaction.logger.debug(`Modifying async response`);
            if (!res.ok) {
                interaction.logger.error(`Non-200 response from RAWG [status:${res.status}] [statusText:${res.statusText}]`, { api_response: JSON.stringify(res)})
                return {
                    type: 'error',
                    text: 'Что-то не задалось с поиском, попробуй ещё раз'
                }
            }
            const json = await res.json();
            if (!json?.results?.length) {
                return {
                    type: 'error',
                    text: `Не смог ничего найти, попробуй другой запрос`
                }
            }
            return transformGameDetails(json?.results[0]);
        })
        .catch((err) => {
            interaction.logger.error(`Error while getting game details from RAWG`, { error: err.stack || err});
            return new Error(`Error getting RAWG/games response`);
        });
};