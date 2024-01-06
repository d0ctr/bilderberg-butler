require('dotenv').config();
const { startRedis } = require('./services/redis');
const DiscordClient = require('./discord');
const { TelegramClient } = require('./telegram');
const APIServer = require('./api');
const logger = require('./logger');
const { fetchCurrenciesList } = require('./services/currency');

function main() {
    let app = {};

    app.logger = require('./logger').child({ module: 'index' });

    app.redis = startRedis();

    fetchCurrenciesList().then(currencies_list => {
        if (currencies_list !== null) {
            app.currencies_list = currencies_list;
        }
    });

    // update daily
    setInterval(() =>  fetchCurrenciesList(), 24 * 60 * 60 * 1000);

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

process_logger = logger.child({ module: 'process' });

process.on('warning', (warning) => {
    process_logger.warn(warning.message);
});

process.on('uncaughtException', (error) => {
    process_logger.error('Got unhandledException:', error);
});

process.on('beforeExit', async () => {
    process_logger.info('Gracefully shutdowning application...');
    await app?.discord_client?.stop();
    await app?.telegram_client?.stop();
    await app?.api_server?.stop();
    process.exit();
});