const hltb = new (require('howlongtobeat').HowLongToBeatService)();
const { api: { getTextFromGameDetail }} = require('../../commands/handlers/game-handler');

const { RAWG_API_BASE } = require('../../config.json');

const getHltbInfo = async ({ name, year } = {}) => {
    return await hltb.searchWithOptions(name, { year })
        .then(result => result.length > 0 ? result[0] : null)
        .catch(() => null);
};

const getGame = async ({ slug }) => {
    const game = await fetch(
        `${RAWG_API_BASE}/games/${slug}?`
        + new URLSearchParams({
            key: process.env.RAWG_TOKEN,
        }))
        .then(res => res.json())
        .catch(() => null);
    if (game == null) return;

    const hltbInfo = await getHltbInfo({ name: game.name, year: new Date(game.released).getFullYear() });
    if (hltbInfo != null) {
        const playtimes = hltbInfo.timeLabels.map(([ key, name ]) => ({ name, value: Number.isSafeInteger(hltbInfo[key]) ? hltbInfo[key] : `${Math.floor(hltbInfo[key])}½` }));
        game.hltb = {
            url: `https://howlongtobeat.com/game/${hltbInfo.id}`,
            playtimes
        };

    }

    return game;
}

exports.callback = async (ctx) => {
    const query = require('./utils').parseArgs(ctx, 1)[1]?.trim();
    if (!query) {
        return ['skip'];
    }

    const [category, ..._slug] = query.split(':');
    const slug = _slug.join(':')

    if (!slug) {
        return ['skip']
    }

    if (category === 'game' && process.env.RAWG_TOKEN) {
        const game = await getGame({ slug });
        if (game) {
            const text = getTextFromGameDetail(game);
            return [null, text, null, game.background_image ? {
                link_preview_options: {
                    is_disabled: false,
                    show_above_text: true,
                    url: game?.background_image,
                },
            } : null];
        }
    }

    return ['skip'];
}