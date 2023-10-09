async function roundit(ctx, interaction) {
    if (!ctx.message.reply_to_message) {
        return ['Команду надо отправить в ответ на сообщение с видео.'];
    }
    if (!ctx.message.reply_to_message.video) {
        return ['В сообщении нет видео, чтобы сделать его круглым.'];
    }
    if (ctx.message.reply_to_message.video?.duration > 60) {
        return ['Видео не должно быть дольше минуты.'];
    }
    const { file_id, duration, width, height } = ctx.message.reply_to_message.video;
    if (height !== width) {
        return [`Видео должно быть с соотношением 1:1, у этого видео соотношение 1:${(width/height).toFixed(2)}.`]
    }
    if (height >= 640) {
        return [`Видео должно быть менее 640 пикселей в высоту / ширину, это видео имеет размер ${width} пикселей.`]
    }
    const file = await ctx.api.getFile(file_id);

    ctx.replyWithChatAction('upload_video_note');

    const path = await file.download();

    interaction.logger.debug(`Downloaded file to: ${path}`);

    return [null, { type: 'video_note', path, duration, length: width || height, filename: 'temp.mp4' }];
}

exports.roundit = roundit;