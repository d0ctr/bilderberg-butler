const { default: Redis } = require('ioredis');

const REDIS_URL = "redis://default:mAKjN2CmG2loLGaC2nB1jiEp41PMBfPG@monorail.proxy.rlwy.net:27700";

const redis = new Redis(REDIS_URL);

const data = require('./upload.stage.json');

Promise.allSettled([
    redis.zadd(`tinkov:ratings`, data.map(v => [0, v.file_name.split('.')[0].toLowerCase()]).flat()),
    redis.hmset(`tinkov:data`, data.reduce((p, c) => {
        p[c.file_name.split('.')[0].toLowerCase()] = JSON.stringify(c);
        return p;
    }, {}))
]).finally(() => redis.disconnect())



