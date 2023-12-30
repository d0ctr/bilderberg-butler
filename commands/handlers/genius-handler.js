const { GENIUS_API_BASE } = require('../../config.json');
const { genKey, range, encodeCallbackData, listingMenuCallback } = require('../utils');
const { getRedis } = require('../../services/redis')

const prefix = 'genius';

const searchGenius = async ({ search }) => {
    return await fetch(
        `${GENIUS_API_BASE}/search?` + new URLSearchParams({ q: search }),
        {
            headers: {
                Authorization: `Bearer ${process.env.GENIUS_TOKEN}`
            }
        });
}

const getSongFromGenius = async ({ id }) => {
    return await fetch(
        `${GENIUS_API_BASE}/songs/${id}`,
        {
            headers: {
                Authorization: `Bearer ${process.env.GENIUS_TOKEN}`
            }
        }
    )
}

const getTextFromSongDetail = (song) => {
    return `🎶 <a href="${song.relationships_index_url}">${song.title}</a>\n`
        + (song.album ? `💿 <a href="${song.album.url}">${song.album.name}</a>\n` : '')
        + (song.primary_artist ? `🗣️ <a href="${song.primary_artist.url}">${song.primary_artist.name}</a>` : '')
        + (song.featured_artists?.length ? ` feat. ${song.featured_artists.map(a => `<a href="${a.url}">${a.name}</a>`).join(', ')}` : '')
        + '\n'
        + (song.release_date ? `\nДата релиза: ${new Date(song.release_date).toLocaleDateString('de-DE')}\n` : '')
        + '\n'
        + (song.media?.length ? song.media.map(m => `<a href="${m.url}">${m.provider}</a>`).join(' | ') : '')
}

const getNameForButton = (song, index = null, selected = null) => {
    return `${(index != null && index === selected) ? '☑️ ' : '' }${song.full_title}`;
}

const saveResults = async (key, songs) => {
    const redis = getRedis();
    if (redis == null) {
        logger.error('Can not save game results, redis is unavailable');
        throw { message: 'Redis is unavailable' };
    }

    const data = songs.map(song => ({
        text: getTextFromSongDetail(song),
        url: song.song_art_image_url || song.header_image_url || song.album?.cover_art_url,
        name: getNameForButton(song)
    })).reduce((acc, data, i) => {
        acc[i] = JSON.stringify(data);
        return acc;
    }, {});

    return redis.multi()
        .hset(`${prefix}:${key}`, data)
        .expire(`${prefix}:${key}`, 4 * 60 * 60)
        .exec();
}

const getSongsFromRedis = async (key, start, stop = start + 2) => {
    const redis = getRedis();
    if (redis == null) {
        logger.error('Can not get game results, redis is unavailable');
        throw { message: 'Redis is unavailable' };
    }

    let indexes = range(start, stop + 1);

    try {
        const data = await redis.hmget(`${prefix}:${key}`, ...indexes);
        const size = await redis.hlen(`${prefix}:${key}`);
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


exports.definition = {
    command_name: 'genius',
    args: [
        {
            name: 'query',
            type: 'string',
            description: 'Запрос для поиска песен',
            optional: false
        }
    ],
    limit: 1,
    is_inline: true,
    description: 'Поиск песен на genius.com'
}

exports.condition = !!process.env.GENIUS_TOKEN;

/**
 * 
 * @param {import('../utils').Interaction} interaction
 * @returns 
 */
exports.handler = async (interaction) => {
    const arg = interaction.args?.[0];

    if (!arg) {
        return {
            type: 'error',
            text: 'Для поиска нужно предоставить какую-нибудь фразу'
        }
    }

    return searchGenius({ search: arg })
        .then(async (response) => {
            interaction.logger.silly('Received response from GENIUS/search');
            if (!response.ok) {
                interaction.logger.error(`Non-200 response from GENIUS [status:${response.status}] [statusText:${response.statusText}]`, { api_response: JSON.stringify(response) })
                return {
                    type: 'error',
                    text: 'Genius сейчас недоступен, попробуйте позже'
                }
            }
            const json = await response.json();

            if (json.meta?.status !== 200 || !json.response?.hits?.length) {
                return {
                    type: 'error',
                    text: 'Поиск не удался, попробуйте другой запрос'
                }
            }

            const songs = await Promise.all(
                    json.response.hits
                    .filter(h => h.type === 'song')
                    .slice(0, 10)
                    .map(h => h.result.id)
                    .map(id => getSongFromGenius({ id }).then(r => r.json()))
                ).then(jsons => jsons.map(json => json.response.song));

            const key = genKey();
            let buttons = null;

            try {
                await saveResults(key, songs);
            }
            catch (err) {
                interaction.logger.error('Failed to save songs results', { error: err.stack || err });
            }

            buttons = songs.slice(0, 3).map((song, i) => ([{
                name: getNameForButton(song, i, 0),
                callback: encodeCallbackData({ prefix, key, current: 0, next: i + 1})
            }]));

            if (songs.length > 4) {
                buttons.push([{
                    name: '⏬',
                    callback: encodeCallbackData({ prefix, key, current: 0, next: '>3' })
                }]);
            }

            return {
                type: 'text',
                text: getTextFromSongDetail(songs[0]),
                overrides: {
                    link_preview_options: {
                        is_disabled: false,
                        show_above_text: true,
                        url: songs[0].song_art_image_url || songs[0].header_image_url || songs[0].album?.cover_art_url
                    },
                    buttons,
                    embeded_image: songs[0].song_art_image_url || songs[0].header_image_url || songs[0].album?.cover_art_url
                }
            }
        })
        .catch((err) => {
            interaction.logger.error(`Error while getting song details from GENIUS`, { error: err.stack || err});
            return {
                type: 'error',
                text: 'Что-то у меня поломалось, можешь попробовать ещё раз'
            };
        })
}

exports.callback = async (interaction) => {
    return listingMenuCallback(interaction, getSongsFromRedis);
}