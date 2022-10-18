const dotenv = require('dotenv');
const Redis = require('ioredis');
const DiscordClient = require('./discord');
const TelegramClient = require('./telegram');
const APIServer = require('./api');
const { createLogger, format, transports } = require('winston');
const config = require('./config.json');
const { get_currencies_list } = require('./utils');

dotenv.config();

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.printf(options => {
            return `${options.timestamp} - ${options.module} - ${options.level} - ${options.level === 'error' ? options.message : options.message.replace(/\n/gm, '\\n').replace(/ +/gm, ' ')}`;
        })
    ),
    transports: [new transports.Console()]
});

function main() {
    let app = {};

    app.health = {
        discord: 'off',
        telegram: 'off',
        redis: 'off',
        api: 'off'
    };

    app.logger = logger.child({ module: 'index' });

    app.redis = process.env.REDISCLOUD_URL ? new Redis(process.env.REDISCLOUD_URL) : null;
    if (app.redis) {
        let redis_logger = logger.child({ module: 'redis' });

        app.redis.on('connect', () => {
            redis_logger.info('Redis is connected');
            app.health.redis = 'connect';
        })

        app.redis.on('ready', () => {
            redis_logger.info('Redis is ready');
            app.health.redis = 'ready';
        });

        app.redis.on('error', error => {
            redis_logger.error(`${error}`);
        });

        app.redis.on('reconnecting', time_to => {
            redis_logger.info(`Redis is reconnecting in ${time_to}`);
            app.health.redis = 'reconnecting';
        });

        app.redis.on('close', () => {
            redis_logger.info('Redis connection closed');
            app.health.redis = 'close';
        });

        app.redis.on('end', () => {
            redis_logger.info('Redis ends connection');
            app.health.redis = 'off';
        });
    }

    if (process.env.COINMARKETCAP_TOKEN && config.COINMARKETCAP_API) {
        app.logger.info('Retrieving currencies list...');
        get_currencies_list().then(result => {
            app.logger.info('Retireved currencies list');
            app.currencies_list = result;
        }).catch(err => {
            if (err) {
                app.logger.error(`Error while retrieving currencies list: ${err && err.stack}`);
            }
        });
    }

    app.discord_client = new DiscordClient(app);

    app.telegram_client = new TelegramClient(app);

    app.api_server = new APIServer(app);


    app.logger.info('Starting Discord Client...');
    app.discord_client.start();

    app.logger.info('Starting Telegram Client...');
    app.telegram_client.start();

    app.logger.info('Starting API...');
    app.api_server.start();

    return app;
}

let app = main();

process.on('uncaughtException', (error) => {
    console.error('Got unhandledException:', error);
});

process.on('SIGINT', async () => {
    logger.child({ module: 'process-listener' }).info('Gracefully shutdowning application...');
    await app.discord_client.stop();
    await app.telegram_client.stop();
    await app.api_server.stop();
    process.exit();
});

process.on('SIGTERM', async () => {
    logger.child({ module: 'process-listener' }).info('Gracefully shutdowning application...');
    await app.discord_client.stop();
    await app.telegram_client.stop();
    await app.api_server.stop();
    process.exit();
});