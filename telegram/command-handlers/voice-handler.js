const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_TOKEN
});

async function generateSpeech(text) {
    return await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'onyx',
        response_format: 'opus',
        input: text,
    }).then(response => response.arrayBuffer())
    .then(arrayBuffer => Buffer.from(arrayBuffer));
}

/**
 * 
 * @param {import('grammy').Context} input 
 * @param {import('../telegram-client').TelegramInteraction} interaction 
 */
async function voice(input, interaction) {
    const { message } = input;
    if (message.reply_to_message == null 
        || !(message.reply_to_message.caption || message.reply_to_message.text)?.length) {
        return ['Отправь эту команду как ответ на другое сообщение'];
    }

    let audio = null;

    await input.replyWithChatAction('record_voice');
    const actionInterval = setInterval(() => {
        input.replyWithChatAction('record_voice');
    }, 5000);
    const callback = () => {
        clearInterval(actionInterval);
    }

    try {
        audio = await generateSpeech(message.reply_to_message.caption || message.reply_to_message.text);
    }
    catch (err) {
        interaction.logger.error('Failed to generate speech for provided text', { error: err.stack || err });
        return ['Не получилось сгенерировать аудио', null, callback];
    }
    
    if (audio == null) {
        return ['Генераторка сломалась', null, callback];
    }

    return [null, { type: 'voice', media: audio, filename: 'voice.ogg' }, callback];
}

exports.voice = voice;