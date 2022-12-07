const Redis = require('ioredis');

const logger = require('./logger').child({ module: 'redis' });

const { updateComponentHealth, STATE, COMPONENT } = require('./health');

let _redis = null;

/**
 * Start Redis
 * @returns {Redis | null}
 */
let start = () => {
    if (process.env.REDISCLOUD_URL) {
        _redis = new Redis(process.env.REDISCLOUD_URL);
        updateComponentHealth(COMPONENT.REDIS, STATE.READY);

        redis.on('connect', () => {
            logger.info('Redis is connected');
        });

        redis.on('ready', () => {
            updateComponentHealth(COMPONENT.REDIS, STATE.ON);
            logger.info('Redis is ready');
        });

        redis.on('error', error => {
            logger.error(`${error}`, { error: error.stack || error });
        });

        redis.on('reconnecting', time_to => {
            updateComponentHealth(COMPONENT.REDIS, STATE.DEGRADED);
            logger.info(`Redis is reconnecting in ${time_to}`);
        });

        redis.on('close', () => {
            updateComponentHealth(COMPONENT.REDIS, STATE.OFF);
            logger.info('Redis connection closed');
        });

        redis.on('end', () => {
            updateComponentHealth(COMPONENT.REDIS, STATE.OFF);
            logger.info('Redis ends connection');
        });
    }
    else {
        logger.warn('Redis url is not defined, redis storage is disabled');
    }

    return _redis;
}

let redis = () => {
    return _redis;
}

module.exports = {
    start,
    redis,
};