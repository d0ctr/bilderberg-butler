const { InputFile } = require('grammy');

/**
 * Turns Telegram context to an object that can be used as an input to a common command handler
 * @param {Object} ctx
 * @param {Integer} limit number of parsable args
 * @return {Interaction}
 * 
 * `limit` is tricky, it makes possible for argument to consist of multiple words
 * Example: `/foo bar baz bax`
 *   - if we set limit here to 1, we will limit the number 
 *     of args to 1 and this function will join all args with 
 *     spaces, therefore args = ['bar baz bax'].
 *   - if we set limit to 2, we will have 2 args as follows: 
 *     args = ['bar', 'baz bax'], and so on.
 *   - if we set limit to null, we will parse all words as standalone: 
 *     args = ['bar', 'baz', 'bax'].
 * 
 */
function commonizeContext(ctx, limit) {
    let args = [];

    // split all words by <space>
    args = ctx.message.text.replace(/ +/g, ' ').split(' ');

    // remove `/` from the name of the command
    args[0] = args[0].split('').slice(1).join('');

    // concat args to a single arg
    if (limit && (limit + 1) < args.length && limit > 0) {
        args[limit] = args.slice(limit).join(' ');
        args = args.slice(0, limit + 1);
    }

    // Form interaction object
    let interaction = {
        platform: 'telegram',
        command_name: args[0]
    };

    if (args.length > 1) {
        interaction.args = args.slice(1);
    }

    interaction.from = {
        id: ctx.from?.id,
        name: `${ctx.from?.first_name}${ctx.from?.last_name ? ` ${ctx.from.last_name}` : ''}`,
        username: ctx.from?.username
    }

    if (ctx.type === 'private') {
        interaction.space = interaction.from
        interaction.space.type = 'private'
    }
    else {
        interaction.space = {
            id: ctx.chat?.id,
            type: ctx.chat?.type,
            title: ctx.chat?.title
        }
    }

    interaction.id = ctx.message?.message_id;
    interaction.text = ctx.message?.text;
    
    return interaction;
}

function replyWithText(ctx, response, logger) {
    logger.info(`Replying with [${response.text}]`, { response });

    ctx.reply(
        response.text,
        {
            allow_sending_without_reply: true,
            reply_to_message_id: ctx.message?.reply_to_message?.message_id || ctx.message?.message_id,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...response.overrides
        }
    ).then((message) => {
        logger.debug('Replied!', { message_id: message.message_id});
    }).catch(err => {
        logger.error(`Error while replying`, { error: err.stack || err});
        // Try again if only it wasn't an error message
        if (response.type !== 'error') {
            replyWithText(
                ctx,
                {
                    type: 'error',
                    text: `Что-то случилось:\n<code>${err}</code>`
                },
                logger
            )
        }
    });
    
}

function reply(ctx, response, logger) {
    const reply_methods = {
        'audio': ctx.replyWithAudio.bind(ctx),
        'animation': ctx.replyWithAnimation.bind(ctx),
        'chat_action': ctx.replyWithChatAction.bind(ctx),
        'contact': ctx.replyWithContact.bind(ctx),
        'dice': ctx.replyWithDice.bind(ctx),
        'document': ctx.replyWithDocument.bind(ctx),
        'game': ctx.replyWithGame.bind(ctx),
        'invoice': ctx.replyWithInvoice.bind(ctx),
        'location': ctx.replyWithLocation.bind(ctx),
        'media_group': ctx.replyWithMediaGroup.bind(ctx),
        'photo': ctx.replyWithPhoto.bind(ctx),
        'poll': ctx.replyWithPoll.bind(ctx),
        'sticker': ctx.replyWithSticker.bind(ctx),
        'venue': ctx.replyWithVenue.bind(ctx),
        'video': ctx.replyWithVideo.bind(ctx),
        'video_note': ctx.replyWithVideoNote.bind(ctx),
        'voice': ctx.replyWithVoice.bind(ctx),
    };

    const sendReply = reply_methods[response.type];

    if (!sendReply) {
        return replyWithText(ctx, response, logger);
    }

    let media;

    if (response.filename) {
        logger.info(`Replying with file [${JSON.stringify({ ...response, media: '...' })}]`, { response: { ...response, media: '...' } });
        media = new InputFile(response.media, response.filename);
    }
    else {
        logger.info(`Replying with [${JSON.stringify(response)}]`, { response });
        media = response.media;
    }

    sendReply(
        media,
        {
            caption: response.text,
            allow_sending_without_reply: true,
            reply_to_message_id: ctx.message?.reply_to_message?.message_id || ctx.message?.message_id,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...response.overrides
        }
    ).then((message) => {
        logger.debug('Replied!', { message_id: message.message_id});
    }).catch(err => {
        logger.error(`Error while replying`, { error: err.stack || err});
        replyWithText(
            ctx,
            {
                type: 'error',
                text: `Что-то случилось:\n<code>${err}</code>`
            },
            logger
        )
    });
}

/**
 * 
 * @param {*} ctx 
 * @param {*} handler
 */
function handleCommand(ctx, handler) {
    const common_interaction = commonizeContext(ctx);
    const log_meta = {
        module: 'telegram-common-interface-handler',
        command_name: common_interaction.command_name,
        platform: common_interaction.platform,
        interaction: common_interaction
    }
    const logger = require('../logger').child(log_meta);
    common_interaction.logger = logger;

    logger.info(`Received command: ${common_interaction.text}`);
    handler(common_interaction)
    .then(response => {
        if (response.text) {
            response.text = response.text.replace(/<br ?\/>/gm, '\n');
        }
        reply(ctx, response, logger);
    }).catch((err) => {
        logger.error(`Error while handling`, { error: err.stack || err });
        replyWithText(
            ctx,
            {
                type: 'error',
                text: `Что-то случилось:\n<code>${err}</code>`
            },
            logger
        )
    });
}

async function getLegacyResponse(ctx, handler) {
    const common_interaction = commonizeContext(ctx);
    const log_meta = {
        module: 'telegram-common-interface-handler',
        command_name: common_interaction.command_name,
        platform: common_interaction.platform,
        interaction: common_interaction
    }
    const logger = require('../logger').child(log_meta);
    common_interaction.logger = logger;

    logger.info(`Received command: ${common_interaction.text}`);
    let response = await handler(common_interaction);
    return [response.error, response, null, response.overrides];
}

module.exports = {
    commonizeContext,
    handleCommand,
    getLegacyResponse
}