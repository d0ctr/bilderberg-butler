const logger = require('../../logger').child({ module: 'tinkov-handler' });

/**
 * @typedef {file_id: string, file_unique_id: string, file_name: string} FileData
 */

/**
 * Get array of files, that suffice the pattern if specified
 * @param {string?} pattern search pattern 
 * @param {number} n limit
 * @returns {Promise<[name: string, FileData][]>}
 */
async function getBest(pattern = null, n = 50) {
    const redis = require('../../services/redis').getRedis();
    if (!redis) {
        throw new Error('Storage is offline');
    }

    const names = [];
    try {
        if (pattern === null) {
            const result = await redis.zrange('tinkov:ratings', 0, n - 1, 'REV');
            names.push(...result);
        }
        else {
            const result = await redis.zrange('tinkov:ratings', 0, -1, 'REV')
            names.push(...result.filter(r => r.includes(pattern.toLowerCase())).slice(0, 10))
        }
    }
    catch (err) {
        logger.error('Failed to get a range of names from [tinkov:ratings]', { error: err.stack || err });    
    }
    if (!names.length) return [];

    const data = await redis.hmget('tinkov:data', names)
        .catch(err => {logger.error('Failed to get data for names from [tinkov:data]', { error: err.stack || err })});

    return data.filter(d => !!d).map((d, i) => [names[i], JSON.parse(d)]);
}

/**
 * Increment the rank values since file was used
 * @param {string} name 
 */
async function used(name) {
    const redis = require('../../services/redis').getRedis();
    if (!redis) {
        throw new Error('Storage is offline');
    }

    redis.zincrby('tinkov:ratings', 1, name)
        .catch(err => logger.error(`Failed to incr rating of name [${name}] in [tinkov:data]`, { error: err.stack || err }));
}

async function tinkov(input) {
    let pattern = require('./utils').parseArgs(input, 1)[1];

    if (!pattern || !pattern.length) pattern = null;

    try {
        const results = await getBest(pattern);
        if (!results.length) return ['Ничего не нашлось'];

        return [null, results.map(r => ({
            type: 'video',
            media: r[1].file_id,
            text: r[0],
            overrides: {
                caption: null,
                id: r[1].file_unique_id,
            }
        }))]
    }
    catch (err) {
        this.logger.error('Failed to get files data', { error: err.stack || err });
        return ['<blockquto>я как бы не совсем понимаю как это работает</blockquote>\nИными словами: что-то сломалось']
    }
}

module.exports = tinkov;