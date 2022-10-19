const GrammyTypes = require('grammy');
const {ahegaoHandler} = require("./command-handlers/ahegao-handler");
const {wiki} = require("./command-handlers/wiki-handler");
const {calc} = require("./command-handlers/calc-handler");
const {curl} = require("./command-handlers/curl-handler");
const {convertCurrency} = require("./command-handlers/currency-handler");
const {sendDiscordNotification} = require("./command-handlers/discord-handler");
const {fizzbuzz} = require("./command-handlers/fizzbuzz-handler");
const {get, set, getList} = require("./command-handlers/get-set-handlers");
const {urban} = require("./command-handlers/urban-handler");
const {gh} = require("./command-handlers/github-handler");
const {help} = require("./command-handlers/help-handler");
const {html} = require("./command-handlers/html-handler");
const {ping} = require("./command-handlers/ping-handler");
const {generateImage} = require("./command-handlers/deep-handler");

class TelegramHandler {
    constructor(client) {
        this.logger = client.logger.child({ module: 'telegram-handler' });
    }

    /**
     * Parse command line
     * @param {GrammyTypes.Context | Object} input
     * @param {Integer} limit number of parsable args
     * @return {Array<String>} [0] is always a command name
     */
    _parseArgs(input, limit) {
        let args = [];
        // split all words by <space>
        args = input.message.text.replace(/ +/g, ' ').split(' ');
        // remove `/` from the name of the command
        args[0] = args[0].split('').slice(1).join('');
        // concat args to single arg
        if (limit && (limit + 1) < args.length && limit > 0) {
            args[limit] = args.slice(limit).join(' ');
            args = args.slice(0, limit + 1);
        }
        return args;
    }

    /**
     * `/start` command handler
     * @returns {[null, String]}
     */
    start() {
         let message = 'Этот бот что-то может, чтобы узнать что, воспользуйся командой /help';
         return [null, message];
    }

    wiki = wiki.bind(this);

    calc = calc.bind(this);

    ahegao = ahegaoHandler.bind(this);

    curl = curl.bind(this);

    cur = convertCurrency.bind(this);

    discord_notification = sendDiscordNotification.bind(this);

    fizzbuzz = fizzbuzz.bind(this);

    get = get.bind(this);

    set = set.bind(this);

    get_list = getList.bind(this);

    urban = urban.bind(this);

    gh = gh.bind(this);

    help = help;

    html = html.bind(this);

    ping = ping;

    deep = generateImage.bind(this);

}

module.exports = TelegramHandler;
