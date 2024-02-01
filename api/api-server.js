const express = require('express');

const config = require('../config.json')
const { setHealth, getHealth } = require('../services/health');

/**
 * API Server
 * @namespace API
 */

/**
 * @class
 * @memberof API
 */
class APIServer {
    /**
     * @param {object} app 
     */
    constructor (app) {
        this.app = app;
        this.logger = require('../logger').child({ module: 'api-server' });

        this.express = express();

        this.express.use((req, res, next) => {
            this.logger.silly(
                `Received [${req.method} : ${req.originalUrl}]`,
                { method: req.method, uri: req.originalUrl, payload: ['dev', 'test'].includes(process.env.ENV) ? req?.body : '...' }
            );
            next();
        });

        this.express.get('/', (req, res) => {
            res.redirect(config.API_HOMEPAGE);
        });

        this.express.get('/health', (req, res) => {
            res.json(getHealth());
        })

        this.express.get('/health/:name', (req, res) => {
            if (req.params.name && Object.keys(this.app.health).includes(req.params.name)) {
                res.json({
                    [req.params.name]: getHealth(req.params.name)
                });
                return;
            }
            res.json(getHealth());
        });

        this.express.get('/discordredirect/:prefix/:serverid/:channelid', (req, res) => {
            if (req.params.serverid && req.params.channelid && req.params.prefix) {
                res.redirect(`discord://discord.com/${req.params.prefix}/${req.params.serverid}/${req.params.channelid}`);
                return;
            }
            res.sendStatus(404);
        });
    }

    /**
     * Start listening on `PORT`
     * @returns {Promise}
     */
    async start() {
        if (!process.env.PORT) {
            this.logger.warn(`Port for API wasn't specified, API is not started.`);
            return;
        }
        this._server = this.express.listen(process.env.PORT, () => {
            this.logger.info('API is ready');
            setHealth('api', 'ready');
        })
    }

    /**
     * Stop listening on `PORT`
     * @returns {Promise}
     */
    async stop() {
        if (!process.env.PORT) {
            return;
        }
        this.logger.info('Gracefully shutdowning API');
        this._server.close(err => {
            if (err) {
                this.logger.error(`Error while shutdowning API`, { error: err.stack || err });
            }
            setHealth('api', 'off');
        });
    }

    /**
     * Set middleware to catch webhooks
     * @param {string} uri - url catch for middlware 
     * @param {object} middleware - middleware
     */
    setWebhookMiddleware(uri, middleware) {
        this.express.use(uri, express.json());
        this.express.use(uri, middleware);
    }
}

module.exports = APIServer;
