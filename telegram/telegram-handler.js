const { fizzbuzz } = require("./command-handlers/fizzbuzz-handler");
const { get, set, getList, del } = require("./command-handlers/get-set-handlers");
const { gh } = require("./command-handlers/github-handler");
const { help } = require("./command-handlers/help-handler");
const { html } = require("./command-handlers/html-handler");
const { generateImage } = require("./command-handlers/deep-handler");
const { info } = require("./command-handlers/info-handler");
const ChatGPTHandler = require('./gpt-handler');

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
    
    start = {
        /**
         * `/start` command handler
         * @returns {[null, String]}
         */
        handler: async () => {
            let message = 'Этот бот что-то может, чтобы узнать что, воспользуйся командой /help';
            return [null, message];
        },
        help: []
    }        

    fizzbuzz = { handler: fizzbuzz.bind(this), help: [] };

    get = { handler: get.bind(this), help: ['{название}', 'Вызвать контент, сохранённый командой /set'] };

    set = { handler: set.bind(this), help: ['{название}', 'Сохранить содержимое сообщения']};

    get_list = { handler: getList.bind(this), help: ['Вызвать список гетов, доступных в этом чате'] };

    del = { handler: del.bind(this), help: ['{название}', 'Удалить гет, доступно только владельцу (если он есть)'] };
    
    gh = { handler: gh.bind(this), help: [] };

    help = { handler: help, help: ['Вызвать список доступных команд']};

    html = { handler: html.bind(this), help: [] };

    deep = { handler: generateImage.bind(this), help: ['{описание}', 'Генерирует 4 картинки по описанию (DeepAI)'] };

    info = { handler: info.bind(this), help: ['Вызвать информацию о чате и отправителе'] };

    ytdl = { handler: require('./command-handlers/ytdl-handler').ytdl.bind(this), help: [] };

    webapp = { handler: require('./command-handlers/webapp-handler').webapp.bind(this), help: [] };

    roundit = { handler: require('./command-handlers/roundit-handler').roundit.bind(this), help: ['Превратить видео в кружок'] };

    imagine = { handler: require('./command-handlers/imagine-handler').imagine.bind(this), help: ['{описание}', 'Генерирует 4 картинки по описанию (DALL-E)'] };

    new_system_prompt = { handler: ChatGPTHandler.handleAdjustSystemPrompt.bind(ChatGPTHandler), help: ['{промпт}', 'Задать новый системный промпт для ChatGPT и/или проверить, установленный сейчас'] };

    answer = { handler: ChatGPTHandler.handleAnswerCommand.bind(ChatGPTHandler), help: ['{запрос?}', 'Спросить у ChatGPT, можно использовать как реплай'] };

    tree = { handler: ChatGPTHandler.handleTreeRequest.bind(ChatGPTHandler), help: ['Запросить контекстное дерево ChatGPT'] };

    context = { handler: ChatGPTHandler.handleContextRequest.bind(ChatGPTHandler), help: ['Запросить контекст сообщения'] };

    gpt4 = { handler: ChatGPTHandler.handleModeledAnswerCommand.bind(ChatGPTHandler, 'gpt-4'), help: ['{запрос?}', '/answer, но с использованием GPT-4'] };

    gpt4_32 = { handler: ChatGPTHandler.handleModeledAnswerCommand.bind(ChatGPTHandler, 'gpt-4-32k'), help: ['{запрос?}', '/answer, но с использованием GPT-4 с максимумом в 32тыс токенов'] };
}

module.exports = TelegramHandler;
