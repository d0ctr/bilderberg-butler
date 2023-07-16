exports.ringit = async (ctx) => {
    if (!ctx.message.reply_to_message) {
        return ['Команду надо отправить в ответ на сообщение с видео.'];
    }
    if (!ctx.message.reply_to_message.video) {
        return ['В сообщении нет видео, чтобы сделать его круглым.'];
    }
    if (ctx.message.reply_to_message.video?.duration > 60) {
        return ['Видео не должно быть дольше минуты'];
    }

    const file = await ctx.api.getFile(ctx.message.reply_to_message.video.file_id);

    const path = await file.download();

    return [null, { type: 'video_note', path }];
};