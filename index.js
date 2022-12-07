if (process.env.ENV === 'prod') {
    require('dotenv-vault-core').config();
}
else {
    require('dotenv').config();
}
const DiscordClient = require('./discord');
const TelegramClient = require('./telegram');
const APIServer = require('./api');
const config = require('./config.json');
const { get_currencies_list } = require('./utils');
const logger = require('./logger');
const { start: startRedis, redis } = require('./redis');

function main() {
    let app = {};

    app.logger = require('./logger').child({ module: 'index' });
    startRedis();
    app.redis = redis();

    if (process.env.COINMARKETCAP_TOKEN && config.COINMARKETCAP_API) {
        app.logger.info('Retrieving currencies list...');
        get_currencies_list().then(result => {
            app.logger.info('Retrieved currencies list');
            app.currencies_list = result;
        }).catch(err => {
            if (err) {
                app.logger.error(`Error while retrieving currencies list: ${err.stack || err}`);
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