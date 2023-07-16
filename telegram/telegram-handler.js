const { fizzbuzz } = require("./command-handlers/fizzbuzz-handler");
const { get, set, getList, del } = require("./command-handlers/get-set-handlers");
const { gh } = require("./command-handlers/github-handler");
const { help } = require("./command-handlers/help-handler");
const { html } = require("./command-handlers/html-handler");
const { generateImage } = require("./command-handlers/deep-handler");
const { info } = require("./command-handlers/info-handler");

class TelegramHandler {
    constructor() {
        this.logger = require('../logger').child({ module: 'telegram-handler' });
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
    async start() {
        let message = 'Этот бот что-то может, чтобы узнать что, воспользуйся командой /help';
        return [null, message];
    }

    fizzbuzz = fizzbuzz.bind(this);

    get = get.bind(this);

    set = set.bind(this);

    get_list = getList.bind(this);

    del = del.bind(this);
    
    gh = gh.bind(this);

    help = help;

    html = html.bind(this);

    deep = generateImage.bind(this);

    info = info.bind(this);

    ytdl = require('./command-handlers/ytdl-handler').ytdl.bind(this);

    webapp = require('./command-handlers/webapp-handler').webapp.bind(this);

    roundit = require('./command-handlers/roundit-handler').roundit.bind(this);
}

module.exports = TelegramHandler;
