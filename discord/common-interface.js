const TurndownService = require('turndown');
const { EmbedBuilder } = require('discord.js');

const turndownService = new TurndownService({
    codeBlockStyle: 'fenced',
});
turndownService.addRule('a', {
    filter: ['a'],
    replacement: (content, node) => {
        const href = node.getAttribute('href');
        return `[${content}](<${href}>)`;
    }
});

function commonizeInteraction(interaction, definition) {
    let common_interaction = {
        platform: 'discord',
        command_name: interaction.commandName,
        text: interaction.toString(),
    }

    // Parse args
    if (definition?.args) {
        common_interaction.args = [];
        definition.args.forEach(arg => {
            common_interaction.args.push(interaction.options.get(arg.name)?.value);
        });
    }

    if (interaction.user) {
        common_interaction.from = {
            id: interaction.user.id,
            username: interaction.user.username
        }
    }

    if (interaction.guild) {
        common_interaction.space = {
            id: interaction.guild.id,
            title: interaction.guild.name,
            type: 'guild'
        }
        common_interaction.from.name = interaction.member.displayName;
    }
    else {
        common_interaction.space = common_interaction.from;
    }

    common_interaction.id = interaction.id;

    return common_interaction;
}

function replyWithText(interaction, response, logger) {
    logger.info(`Replying with text: ${response.text}`);

    interaction.reply(response.text)
    .then((messsage) => {
        logger.debug('Replied!', { message_id: messsage.id });
    }).catch(err => {
        logger.error(`Error while replying`, { error: err.stack || err });
        // Try again if only it wasn't an error message
        if (response.type !== 'error') {
            replyWithText(
                interaction,
                {
                    type: 'error',
                    text: `Что-то случилось:\n\`${err}\``
                },
                logger
            );
        }
    });
}

function replyWithEmbed(interaction, response, logger) {
    logger.info(`Replying with [${JSON.stringify({ ...response, media: '...'})}]`, { response: { ...response, media: '...'} });
    
    const payload = {};

    const embed = new EmbedBuilder();

    if (response.text) {
        payload.content = response.text;
    }

    if (response.filename) {
        payload.files = [response.media];
    }
    else {
        embed.setImage(response.media);
        payload.embeds = [embed];
    }

    interaction.reply(payload)
    .then((messsage) => {
        logger.debug('Replied!', { message_id: messsage.id });
    }).catch(err => {
        logger.error(`Error while replying`, { error: err.stack || err });
        replyWithText(
            interaction,
            {
                type: 'error',
                text: `Что-то случилось:\n\`${err}\``
            },
            logger
        );
    });
}

function reply(interaction, response, logger) {
    if (['text', 'error'].includes(response.type)) {
        replyWithText(interaction, response, logger);
        return;
    }

    if (['photo', 'image'].includes(response.type)) {
        replyWithEmbed(interaction, response, logger);
        return;
    }

    logger.error(`Can't send file of type: ${response.type}`);

    if (response.text) {
        logger.info('Sending text instead');
        replyWithText(
            interaction,
            {
                type: 'text',
                text: response.text
            },
            logger
        );
        return;
    }
    
    replyWithText(
        interaction,
        {
            type: 'error',
            text: `Пока что не могу ответить на это сообщение из-за типа контента в ответе: \`${response.type}\``
        },
        logger
    );
}

function handleCommand(interaction, handler ,definition) {
    const common_interaction = commonizeInteraction(interaction, definition);
    const log_meta = {
        module: 'discord-common-interface-handler',
        command_name: common_interaction.command_name,
        platform: common_interaction.platform,
        interaction: common_interaction
    };
    const logger = require('../logger').child(log_meta);
    common_interaction.logger = logger.child({ ...log_meta, module: `common-handler-${common_interaction.command_name}` });

    logger.info(`Received command: ${common_interaction.text}`);

    handler(common_interaction)
    .then(response => {
        if (response.text) {
            response.text = turndownService.turndown(response.text.replace(/(\n|\\n)/gm, '<br/>'));
        }
        reply(interaction, response, logger);
    }).catch(err => {
        logger.error(`Error while handling`, { error: err.stack || err });
        replyWithText(
            interaction,
            {
                type: 'error',
                text: `Что-то случилось:\n\`${err}\``
            },
            logger
        );
    });
};

module.exports = {
    commonizeInteraction,
    handleCommand
};