const { default: Redis } = require('ioredis');

const REDIS_URL = "redis://default:G6ecFGCMoKgenIOg1CKe5Bll53Ej2AlH@monorail.proxy.rlwy.net:44686";

const redis = new Redis(REDIS_URL);

const data = require('./upload.prod.json');

/**
 * 
 * @param {data[0]} file_data 
 * @returns 
 */
const file_to_name = (file_data) => file_data.file_name.split('.').slice(0, -1).join(' ').toLowerCase();

Promise.allSettled([
    redis.zadd(`tinkov:ratings`, data.map(v => [0, file_to_name(v)]).flat()),
    redis.hset(`tinkov:map`, data.reduce((p, c) => {
        p[c.file_unique_id] = file_to_name(c);
        p[file_to_name(c)] = c.file_unique_id;
        return p;
    }, {})),
    redis.hmset(`tinkov:data`, data.reduce((p, c) => {
        p[file_to_name(c)] = JSON.stringify(c);
        return p;
    }, {}))
]).finally(() => redis.disconnect())



