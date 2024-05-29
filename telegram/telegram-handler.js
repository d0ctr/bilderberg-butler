const { fizzbuzz } = require("./command-handlers/fizzbuzz-handler");
const { get, set, getList, del } = require("./command-handlers/get-set-handlers");
const { gh } = require("./command-handlers/github-handler");
const { help } = require("./command-handlers/help-handler");
const { html } = require("./command-handlers/html-handler");
const { generateImage } = require("./command-handlers/deep-handler");
const { info } = require("./command-handlers/info-handler");
const ChatLLMHandler = require('./llm-handler');


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

    get: { handler: get, help: ['{название}', 'Вызвать контент, сохранённый командой /set'] },

    set: { handler: set, help: ['{название}', 'Сохранить содержимое сообщения']},

    get_list: { handler: getList, help: ['Список гетов, доступных в этом чате'] },

    del: { handler: del, help: ['{название}', 'Удалить гет, доступно только владельцу'] },
    
    gh: { handler: gh, help: [] },

    help: { handler: help, help: ['Список доступных команд']},

    html: { handler: html, help: [] },

    deep: { handler: generateImage, help: ['{запрос}', 'Генерирует 4 картинки по описанию (DeepAI)'] },

    info: { handler: info, help: ['Информация о чате и отправителе'] },

    ytdl: { handler: require('./command-handlers/ytdl-handler').ytdl, help: [] },

    webapp: { handler: require('./command-handlers/webapp-handler').webapp, help: [] },

    roundit: { handler: require('./command-handlers/roundit-handler').roundit, help: ['Превратить видео в кружок'] },

    new_system_prompt: { handler: (...args) => ChatLLMHandler.handleAdjustSystemPrompt(...args), help: ['{запрос}', 'Задать новый системный промпт для ChatLLM и/или проверить, установленный сейчас'] },

    answer: { handler: (...args) => ChatLLMHandler.handleAnswerCommand(...args), help: ['{запрос?}', 'Спросить у ChatLLM, можно использовать как реплай (распознаёт изображения)'] },

    tree: { handler: (...args) => ChatLLMHandler.handleTreeRequest(...args), help: ['Контекстное дерево ChatLLM'] },

    context: { handler: (...args) => ChatLLMHandler.handleContextRequest(...args), help: ['Контекст сообщения'] },

    gpt4: { handler: (...args) => ChatLLMHandler.handleModeledAnswerCommand('gpt-4o', ...args), help: ['{запрос?}', '/answer, но с использованием GPT-4 (распознаёт изображения)'] },

    opus: { handler: (...args) => ChatLLMHandler.handleModeledAnswerCommand('claude-3-opus-20240229', ...args), help: ['{запрос?}', '/answer, но с использованием Claude 3 Opus с большей производительностью'] },
    
    sonnet: { handler: (...args) => ChatLLMHandler.handleModeledAnswerCommand('claude-3-sonnet-20240229', ...args), help: ['{запрос?}', '/answer, но с использованием Claude 3 Sonnet'] },

    tldr: { handler: require('./command-handlers/tldr-handler').tldr, help: ['{ссылка?}', 'Возвращает краткий персказ сгенерированный YandexGPT'] },
    
    voice: { handler: require('./command-handlers/voice-handler').voice, help: ['Генерирует голосове сообщение из текста или аудио'] },
    
    t: { handler: require('./command-handlers/tinkov-handler').tinkov, help: ['{запрос?} Прописные истины'] },
    
    set_sticker: { handler: require('./command-handlers/sticker-handler').setSticker, help: [] },
    
    autoreply: { handler: require('./command-handlers/autoreply-handler').toggleAutoreplyHandler, help: ['Переключить режим автоответа для ChatLLM'] },
    
    autoreply_on: { handler: require('./command-handlers/autoreply-handler').setAutoreplyHandler(true), help: ['Включить автоматический ответ от ChatLLM'] },

    autoreply_off: { handler: require('./command-handlers/autoreply-handler').setAutoreplyHandler(false), help: ['Отключить автоматический ответ от ChatLLM'] },

    events: { handler: require('./command-handlers/events-handler').events, help: ['Список запланированных эвентов на дискорд сервере'] },
}
