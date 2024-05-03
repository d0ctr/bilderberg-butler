const { webapp_callback: getGame, condition: isGameAvailable } = require('../../commands/handlers/game-handler');
const { webapp_callback: getSong, condition: isSongAvailable } = require('../../commands/handlers/genius-handler');

function getUrlOverride(url) {
    return url ? {
        link_preview_options: {
            is_disabled: false,
            show_above_text: true,
            url,
        }
    } : null;
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

    let result = null;

    if (category === 'game' && isGameAvailable) {
        result = await getGame(slug);
    }
    else if (category === 'song' && isSongAvailable) {
        result = await getSong(slug);
    }
    
    return result !== null 
        ? [null, result.text, null, getUrlOverride(result.url)] 
        : ['skip'];
}