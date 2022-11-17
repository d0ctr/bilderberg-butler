const TelegramHandler = require('../telegram/telegram-handler');
const config = require('../config.json');
const { getHTMLResponse } = require('./utils');

class APIHandler {
    constructor(server) {
        this.logger = require('../logger').child({ module: 'api-handler' });
        this.server = server;
        this.telegram_handler = new TelegramHandler(server);
    }

    _fakeTelegramInteraction(req, res) {
        let fakeInteraction = {
            getCurrency: (name) => {
                return this.server.currencies_list ? this.server.currencies_list[name] : null;
            },
        }
        return fakeInteraction;
    }

    _fakeTelegramContext(command, req, res) {
        this.logger.info(`${JSON.stringify(req.query)}`);
        let fakeContext = {
            message: {
                text: `${command} ${req.query.args.replace(/,/g, ' ')}`,
            },
        }
        return fakeContext;
    }

    _respond(res, message, type) {
        this.logger.info(`Responding with ${type ? `[${type}] ` : ''}[${JSON.stringify(message)}]`);
        switch(type) {
            case 'HTML': 
                return res.send(getHTMLResponse(message));
            case 'JSON':
                return res.json(message);
            case 'REDIRECT':
                return res.redirect(message);
            case 'TEXT':
            default:
                return res.send(message);
        }
    }

    async help(req, res) {
        this._respond(res,`
    <h1>Available API Endpoints:</h1>
    <table style="border: 2px solid black">
        <thead>
            <tr>
                <th>Path</th>
                <th>Arguments</th>
                <th>Description</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <th>
                    <a href="/command/help" title="Example">
                        <pre>/command/help</pre>
                    </a>
                </th>
                <th>None</th>
                <th>Prints this page.</th>
            </tr>
            <tr>
                <th>
                    <a href="/command/cur?args=1,USD,TRY" title="/command/cur?args=1,USD,TRY">
                        <pre>/command/cur</pre>
                    </a>
                </th>
                <th>amount,from,to</th>
                <th>Converts some amount from one currency to another.</th>
            </tr>
            <tr>
                <th>
                    <a href="/command/calc?args=1%20%2B%201" title="/command/cur?args=1%20%2B%201">
                        <pre>/command/calc</pre>
                    </a>
                </th>
                <th>math expression</th>
                <th>Calculates provided math expression</th>
            </tr>
            <tr>
                <th>
                    <a href="/command/ahegao" title="/command/ahegao">
                        <pre>/command/ahegao</pre>
                    </a>
                </th>
                <th>None</th>
                <th>Returns random ahegao</th>
            </tr>
        </tbody>
    </table>`, 'HTML');
    }

    async cur(req, res) {
        const fakeContext = this._fakeTelegramContext('cur', req, res);
        const fakeInteraction = this._fakeTelegramInteraction(req, res);
        const [err, message] = await this.telegram_handler.cur(fakeContext, fakeInteraction);
        if (err) {
            this.logger.info(`Received error message [${err}]`);
            return this._respond(res, '/command/help', 'REDIRECT');
        }
        if (message) {
            let parsed_message = message.split(' = '); // [ orig value orig currency, conv value conv currency]
            let response = {
                result: parsed_message[1].split(' ', 1)[0], // just converted value
                longResult: message, // val cur = val cur
                parsed: {
                    amount: parsed_message[0].split(' ', 1)[0],
                    from: parsed_message[0].replace(`${parsed_message[0].split(' ', 1)[0]} `, ''),
                    to: parsed_message[1].replace(`${parsed_message[1].split(' ', 1)[0]} `, ''),
                    result: parsed_message[1].split(' ', 1)[0]
                }
            }
            return this._respond(res, response, 'JSON');
        }
        return this._respond(res, '');
    }

    async calc(req, res) {
        const fakeContext = this._fakeTelegramContext('calc', req, res);

        const [err, message] = await this.telegram_handler.calc(fakeContext);
        if (err) {
            this.logger.info(`Received error message [${err}]`);
            return this._respond(res, '/command/help', 'REDIRECT');
        }
        if (message) {
            let parsed_message = message.split(' = ');
            let response = {
                result: parsed_message[1],
                longResult: message,
                parsed: {
                    expression: parsed_message[0],
                    result: parsed_message[1]
                }
            }
            return this._respond(res, response, 'JSON');
        }
        return this._respond(res, '');
    }

    async ahegao(req, res) {
        const [err, message] = await this.telegram_handler.ahegao();
        if (err) {
            this.logger.info(`Received error message [${err}]`);
            return this._respond(res, '/command/help', 'REDIRECT');
        }
        if (message) {
            return this._respond(res, message.url, 'REDIRECT')
        }
        return this._respond(res, '');
    }
}

module.exports = APIHandler;