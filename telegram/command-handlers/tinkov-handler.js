const logger = require('../../logger').child({ module: 'tinkov-handler' });

/**
 * Tinkov Command
 * @namespace t
 * @memberof Telegram.Commands
 */

/**
 * @typedef {{file_id: string, file_unique_id: string, file_name: string}} FileData
 * @memberof Telegram.Commands
 */

/**
 * Checks if a given name includes all the specified words in a pattern.
 *
 * @param {string} name - The name to check.
 * @param {string} pattern - The pattern containing words to check against the name.
 * @returns {boolean} True if the name includes all words in the pattern, false otherwise.
 * @memberof Telegram.Commands.t
 */
function isSimilar(name, pattern) {
    const words = pattern.split(/[ ,.]+/);
    return words.every(word => name.includes(word));
}

/**
 * Get array of files, that suffice the pattern if specified
 * @param {string?} pattern search pattern 
 * @param {number} n limit
 * @returns {Promise<[string, FileData][]>}
 * @memberof Telegram.Commands.t
 */
async function getBest(pattern = null, n = 50) {
    const redis = require('../../services/redis').getRedis();
    if (!redis) {
        throw new Error('Storage is offline');
    }

    const names = [];
    try {
        if (pattern == null) {
            const result = await redis.zrange('tinkov:ratings', 0, n - 1, 'REV');
            names.push(...result);
        }
        else {
            const result = await redis.zrange('tinkov:ratings', 0, -1, 'REV')
            names.push(...result.filter(r => isSimilar(r, pattern.toLowerCase())).slice(0, 10))
        }
    }
    catch (err) {
        logger.error('Failed to get a range of names from [tinkov:ratings]', { error: err.stack || err });    
    }
    if (!names.length) return [];

    const data = await redis.hmget('tinkov:data', names)
        .catch(err => {
            logger.error('Failed to get data for names from [tinkov:data]', { error: err.stack || err });
            return [];
        });

    return data.map((d, i) => [names[i], !!d ? JSON.parse(d) : null]).filter(([_, d]) => d != null);
}

/**
 * Increment the rank values since file was used
 * @param {string} file_unique_id 
 * @memberof Telegram.Commands.t
 */
async function used(file_unique_id) {
    const redis = require('../../services/redis').getRedis();
    if (!redis) {
        logger.error('Attempted to update the rank of a result, but the storage is offline');
        return;
    }
    if (file_unique_id.startsWith('tinkov:')) file_unique_id = file_unique_id.slice('tinkov:'.length);

    const name = await redis.hget('tinkov:map', file_unique_id).catch(err => {
        logger.error(`Could not find the name for the file_unique_id [${file_unique_id}]`, { error: err.stack || err });
        return null;
    });
    if (name == null) return;

    redis.zincrby('tinkov:ratings', 1, name)
        .catch(err => logger.error(`Failed to increment rating of name [${name}] in [tinkov:data]`, { error: err.stack || err }));
}

/**
 * Tinkov Command Handler
 * @param {import('grammy').Context} ctx 
 * @memberof Telegram.Commands.t
 */
async function tinkov(ctx) {
    let pattern = require('./utils').parseArgs(ctx, 1)[1];

    if (!pattern || !pattern?.length) pattern = null;

    try {
        const results = await getBest(pattern);
        if (!results.length) return ['Ничего не нашлось'];

        return [
            null,
            results.map(r => ({
                type: 'video',
                media: r[1].file_id,
                text: r[0],
                overrides: {
                    caption: null,
                    id: `tinkov:${r[1].file_unique_id}`,
                }
            })),
        ]
    }
    catch (err) {
        this.logger.error('Failed to get files data', { error: err.stack || err });
        return ['<blockquto>я как бы не совсем понимаю как это работает</blockquote>\nИными словами: что-то сломалось']
    }
}

module.exports = { 
    tinkov,
    used
};