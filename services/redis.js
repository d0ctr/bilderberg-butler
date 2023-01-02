require('dotenv-vault-core').config();
if (process.env.ENV !== 'prod') {
    require('dotenv').config();
}
const Redis = require('ioredis');
const { setHealth } = require('./health');
const logger = require('../logger').child({ module: 'redis' });

let redis_instance = null;

const startRedis = () => {
    redis_instance = process.env.REDISCLOUD_URL ? new Redis(process.env.REDISCLOUD_URL) : null;
    
    if (!redis_instance) {
        return null;
    }

    redis_instance.on('connect', () => {
        logger.info('Redis is connected');
        setHealth('redis', 'connect');
    })

    redis_instance.on('ready', () => {
        logger.info('Redis is ready');
        setHealth('redis', 'ready');
    });

    redis_instance.on('error', error => {
        logger.error(`${error}`, { error: error.stack || error });
    });

    redis_instance.on('reconnecting', time_to => {
        logger.info(`Redis is reconnecting in ${time_to}`);
        setHealth('redis', 'reconnecting');
    });

    redis_instance.on('close', () => {
        logger.info('Redis connection closed');
        setHealth('redis', 'close');
    });

    redis_instance.on('end', () => {
        logger.info('Redis ends connection');
        setHealth('redis', 'off');
    });

    return redis_instance;
};

const getRedis = () => redis_instance;

module.exports = {
    startRedis,
    getRedis
}