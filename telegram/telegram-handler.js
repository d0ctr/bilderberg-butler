const { fizzbuzz } = require("./command-handlers/fizzbuzz-handler");
const { get, set, getList, del } = require("./command-handlers/get-set-handlers");
const { gh } = require("./command-handlers/github-handler");
const { help } = require("./command-handlers/help-handler");
const { html } = require("./command-handlers/html-handler");
const { generateImage } = require("./command-handlers/deep-handler");
const { info } = require("./command-handlers/info-handler");
const ChatGPTHandler = require('./gpt-handler');


module.exports = {
    start: {
        /**
         * `/start` command handler
         * @returns {[null, String]}
         */
        handler: async () => {
            let message = 'Этот бот что-то может, чтобы узнать что, воспользуйся командой /help';
            return [null, message];
        },
        help: []
    },

    fizzbuzz: { handler: fizzbuzz, help: [] },

    get: { handler: get, help: ['{name}', 'Вызвать контент, сохранённый командой /set'] },

    set: { handler: set, help: ['{name}', 'Сохранить содержимое сообщения']},

    get_list: { handler: getList, help: ['Вызвать список гетов, доступных в этом чате'] },

    del: { handler: del, help: ['{name}', 'Удалить гет, доступно только владельцу (если он есть)'] },
    
    gh: { handler: gh, help: [] },

    help: { handler: help, help: ['Вызвать список доступных команд']},

    html: { handler: html, help: [] },

    deep: { handler: generateImage, help: ['{query}', 'Генерирует 4 картинки по описанию (DeepAI)'] },

    info: { handler: info, help: ['Вызвать информацию о чате и отправителе'] },

    ytdl: { handler: require('./command-handlers/ytdl-handler').ytdl, help: [] },

    webapp: { handler: require('./command-handlers/webapp-handler').webapp, help: [] },

    roundit: { handler: require('./command-handlers/roundit-handler').roundit, help: ['Превратить видео в кружок'] },

    new_system_prompt: { handler: (...args) => ChatGPTHandler.handleAdjustSystemPrompt(...args), help: ['{prompt}', 'Задать новый системный промпт для ChatGPT и/или проверить, установленный сейчас'] },

    answer: { handler: (...args) => ChatGPTHandler.handleAnswerCommand(...args), help: ['{query?}', 'Спросить у ChatGPT, можно использовать как реплай'] },

    tree: { handler: (...args) => ChatGPTHandler.handleTreeRequest(...args), help: ['Запросить контекстное дерево ChatGPT'] },

    context: { handler: (...args) => ChatGPTHandler.handleContextRequest(...args), help: ['Запросить контекст сообщения'] },

    gpt4: { handler: (...args) => ChatGPTHandler.handleModeledAnswerCommand('gpt-4', ...args), help: ['{query?}', '/answer, но с использованием GPT-4'] },

    gpt4_32: { handler: (...args) => ChatGPTHandler.handleModeledAnswerCommand('gpt-4-32k', ...args), help: ['{query?}', '/answer, но с использованием GPT-4 с максимумом в 32тыс токенов'] },
    
    vision: { handler: (...args) => ChatGPTHandler.handleModeledAnswerCommand('gpt-4-vision-preview', ...args), help: ['{query?}', '/answer, но с использованием GPT-4 с функцией обработки фотографии'] },

    tldr: { handler: require('./command-handlers/tldr-handler').tldr, help: ['{url?}', 'Возвращает краткий персказ сгенерированный YandexGPT'] },
    
    voice: { handler: require('./command-handlers/voice-handler').voice, help: ['Генерирует голосове сообщение из текста или аудио'] },
    
    t: { handler: require('./command-handlers/tinkov-handler').tinkov, help: ['{query?} Даёт возможность поделится умными словами'] },
}
