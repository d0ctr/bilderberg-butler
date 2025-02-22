const { OpenAI } = require('openai');

/**
 * Voics Command
 * @namespace voice
 * @memberof Commands
 */

/**
 * @ignore
 */
const openai = new OpenAI({
    apiKey: process.env.OPENAI_TOKEN || 'placeholder',
    organization: 'org-TDjq9ytBDVcKt4eVSizl0O74',
});

/**
 * OpenAI TTS Generator
 * @param {string} text 
 * @returns {Promise<Buffer>} 
 * @memberof Telegram.Comands.voice
 */
async function generateSpeech(text) {
    return await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'sage',
        response_format: 'opus',
        input: text,
    }).then(response => response.arrayBuffer())
    .then(arrayBuffer => Buffer.from(arrayBuffer));
}

/**
 * Voice Command Handler
 * @param {import('@grammyjs/files').FileFlavor<import('grammy').Context>} ctx 
 * @param {import('../telegram-client').TelegramInteraction} interaction 
 * @memberof Commands.voice
 */
async function voice(ctx, interaction) {
    const { message } = ctx;
    if (message.reply_to_message == null 
        || !(message.reply_to_message.caption || message.reply_to_message.text)?.length
        && !(message.reply_to_message.audio)) {
        return ['Отправь эту команду в ответ на другое сообщение с текстом или аудио'];
    }

    let audio = null;

    await ctx.replyWithChatAction('record_voice');
    const actionInterval = setInterval(() => {
        ctx.replyWithChatAction('record_voice');
    }, 5000);
    const callback = () => {
        clearInterval(actionInterval);
    }

    const text = (message.reply_to_message.caption || message.reply_to_message.text || '');

    if (text.length && !!process.env.OPENAI_TOKEN) {
        try {
            audio = await generateSpeech(text);
        }
        catch (err) {
            interaction.logger.error('Failed to generate speech for provided text', { error: err.stack || err });
            return ['Не получилось сгенерировать аудио', null, callback];
        }
    }
    else if (text.length && !process.env.OPENAI_TOKEN) {
        return ['Генерация аудио временно не доступна', null, callback];
    }
    else {
        try {
            const { mime_type, duration, file_id } = message.reply_to_message.audio;
            interaction.logger.debug(`File ${file_id}, mime ${mime_type}, duration: ${duration}`);

            audio = await ctx.api.getFile(file_id).then(f => f.download());
        }
        catch (err) {
            interaction.logger.error('Failed to get audio file for conversion', { error: err.stack || err });
            return ['Не получилось сконвертировать аудио', null, callback];
        }
    }
    
    if (audio == null) {
        return ['Генераторка сломалась', null, callback];
    }

    return [null, { type: 'voice', media: audio, filename: 'voice.ogg' }, callback];
}

exports.voice = voice;
