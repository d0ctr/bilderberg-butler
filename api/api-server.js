const express = require('express');

const config = require('../config.json')
const APIHandler = require('./api-handler');

class APIServer {
    constructor (app) {
        this.app = app;
        this.logger = app.logger.child({ module: 'api-server' });

        this.express = express();

        this.api_handler = new APIHandler(this);

        this.express.use((req, res, next) => {
            this.logger.info(`Received [${req.method} : ${req.url}]${Object.keys(req.params).length ? ` [${JSON.stringify(req.params)}]` : ''}${Object.keys(req.query).length ? ` [${JSON.stringify(req.query)}]` : ''}`);
            next();
        });

        this.express.get('/', (req, res) => {
            res.redirect(config.API_HOMEPAGE);
        });

        this.express.get('/health', (req, res) => {
            res.json(this.app.health);
        })

        this.express.get('/health/:name', (req, res) => {
            if (req.params.name && Object.keys(this.app.health).includes(req.params.name)) {
                res.json({
                    [req.params.name]: this.app.health[req.params.name]
                });
                return;
            }
            res.json(this.app.health);
        });

        this.registerEndpoint('help');
        this.registerEndpoint('calc');
        this.registerEndpoint('ahegao');

        if (process.env.COINMARKETCAP_TOKEN && config.COINMARKETCAP_API) {
            this.registerEndpoint('cur');
        }
    }

    set health(value) {
        this.app.health.api = value;
    }

    get health() {
        return this.app.health.api;
    }

    get currencies_list() {
        return this.app.currencies_list;
    }

    async start() {
        if (!process.env.PORT) {
            this.logger.warn(`Port for API wasn't specified, API is not started.`);
            return;
        }
        this._server = this.express.listen(process.env.PORT, () => {
            this.logger.info('API is ready');
            this.health = 'ready';
        })
    }

    async stop() {
        if (!process.env.PORT) {
            return;
        }
        this.logger.info('Gracefully shutdowning API');
        this._server.close(err => {
            if (err) {
                this.logger.error(`Error while shutdowning API: ${err.stack}`);
            }
            this.health = 'off';
        });
    }

    setWebhookMiddleware(uri, middleware) {
        this.express.use(uri, express.json());
        this.express.use(uri, middleware);
    }

    registerEndpoint(name) {
        if (typeof this.api_handler[name] === 'function') {
            this.express.get(`/command/${name}`, async (req, res) => this.api_handler[name](req, res))
        }
    }
}

module.exports = APIServer;