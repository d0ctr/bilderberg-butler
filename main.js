require('dotenv-vault-core').config();
if (process.env.ENV !== 'prod') {
    require('dotenv').config();
}
const { startRedis } = require('./services/redis');
const DiscordClient = require('./discord');
const TelegramClient = require('./telegram');
const APIServer = require('./api');
const logger = require('./logger');
const { fetchCurrenciesList } = require('./services/currency');

function main() {
    let app = {};

    app.logger = require('./logger').child({ module: 'index' });

    app.redis = startRedis();

    fetchCurrenciesList().then(currencies_list => {
        app.currencies_list = currencies_list;
    })

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