const TurndownService = require('turndown');
const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, MessagePayload } = require('discord.js');

const turndownService = new TurndownService({
    codeBlockStyle: 'fenced',
    br: ' '
});

turndownService.addRule('a', {
    filter: 'a',
    replacement: (content, node) => {
        const href = node.getAttribute('href');
        return `[${content}](<${href}>)`;
    }
});

/** @typedef {import('discord.js').Interaction} Interaction */

/**
 * @typedef {{
 * platform: 'discord',
 * command_name: string?,
 * text: string,
 * args: any[]?,
 * from: {
 *  id: string?,
 *  username: string?,
 *  name: string?
 * },
 * space: {
 *  type: 'guild',
 *  id: string,
 *  title: string
 * } | {
 *  id: string?,
 *  username: string?
 * },
 * id: string,
 * data: string?
 * }} DiscordInteraction
 */

/**
 * 
 * @param {Interaction} interaction 
 * @param {*} definition 
 * @returns {DiscordInteraction}
 */
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
    common_interaction.data = interaction.customId;

    return common_interaction;
}

function transformOverrides(response) {
    if (response?.overrides?.followup) {
        const { text, url } = response.overrides.followup;
        const components = [
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel(text)
                        .setURL(url)
                        .setStyle(ButtonStyle.Link)
                )
        ];
        response.components = components;
    }

    if (response.overrides?.buttons) {
        if (!response.components) response.components = [];
        
        response.components.push(...response.overrides.buttons.map(row => {
            const actionRow = new ActionRowBuilder();
            actionRow.addComponents(...row.map(button => {
                return new ButtonBuilder()
                    .setLabel(button.name)
                    .setCustomId(button.callback)
                    .setStyle(ButtonStyle.Primary);
            }));
            return actionRow;
        }));
    }

    if (response?.overrides?.embeded_image) {
        response.embeds = [new EmbedBuilder().setImage(response?.overrides?.embeded_image)];
    }

    return response;
}

function replyWithText(interaction, response, logger) {
    logger.info(`Replying with text`, { response });

    // if (response?.overrides?.followup) {
    //     const { text, url } = response.overrides.followup;
    //     let embed = new EmbedBuilder;
    //     text && embed.setTitle(text);
    //     url && embed.setURL(url);
    //     response.embeds = [embed];
    // }

    interaction.editReply({ content: response.text, components: response?.components, embeds: response?.embeds })
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
    const payload = { embeds: [] };

    const embed = new EmbedBuilder();

    if (response.text) {
        payload.content = response.text;
    }

    if (response.components) {
        payload.components = response.components;
    }

    if (response.filename) {
        logger.info(`Replying with file of type: ${response.type}`);
        payload.files = [{ name: response.filename, attachment: response.media }];
    }
    else {
        logger.info(`Replying with media of type: ${response.type}`);
        embed.setImage(response.media);
        payload.embeds.push(embed);
    }
    if (response?.embeds) {
        payload.embeds.unshift(...response.embeds);
    }

    interaction.editReply(payload)
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

function replyWithFile(interaction, response, logger) {
    const payload = { embeds: [] };

    if (response.text) {
        payload.content = response.text;
    }

    if (response.components) {
        payload.components = response.components;
    }

    if (response.filename) {
        logger.info(`Replying with file of type: ${response.type}`);
        payload.files = [{ name: response.filename, attachment: response.media }];
    }
    if (response?.embeds) {
        payload.embeds.unshift(...response.embeds);
    }

    interaction.editReply(payload)
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
    while (response?.text?.length >= 2000) response.text = response.text.split('\n').slice(0, -1).join('\n');

    if (['text', 'error'].includes(response.type)) {
        replyWithText(interaction, response, logger);
        return;
    }

    if (['photo', 'image'].includes(response.type)) {
        replyWithEmbed(interaction, response, logger);
        return;
    }

    if (response.type === 'document' && response.filename) {
        replyWithFile(interaction, response, logger);
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

function handleCommand(interaction, handler, definition) {
    const common_interaction = commonizeInteraction(interaction, definition);
    const log_meta = {
        module: 'discord-common-command-handler',
        command_name: common_interaction.command_name,
        platform: common_interaction.platform,
        interaction: common_interaction
    };
    const logger = require('../logger').child(log_meta);
    common_interaction.logger = logger.child({ ...log_meta, module: `common-command-${common_interaction.command_name}` });

    logger.info(`Received command: ${common_interaction.text}`);

    interaction.deferReply()
    .then(() => handler(common_interaction))
    .then(transformOverrides)
    .then(response => {
        if (response.text) {
            response.text = response.text.replace(/\n|\\n/gm, '<br/>');
            response.text = turndownService.turndown(response.text);
            response.text = response.text.replace(/( *\n *){2,}/gm, '\n\n')
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

/**
 * 
 * @param {import('discord.js').Interaction} interaction 
 * @param {*} response 
 */
async function answerCallback(interaction, response) {
    if (response.type === 'error') {
        return interaction.followUp(response.text);
    }

    switch(response.type) {
        case 'edit_text':
        case 'edit_caption':
            return interaction.editReply({
                content: response.text,
                components: response.components,
                embeds: response.embeds
            });
        case 'edit_media':
            if (response.filename) {
                response.files = [{ name: response.filename, attachment: response.media }];
            }
            else {
                if (!response.embdes) response.embeds = [];
                response.embeds.push(new EmbedBuilder().setImage(response.media));
            }
            return interaction.editReply({
                embeds: response.embeds,
                components: response.components,
                files: response.files,
            })
        case 'edit_buttons':
            return interaction.editReply({
                components: response.components
            });
    }
}

async function handleCallback(interaction, handle) {
    const common_interaction = commonizeInteraction(interaction);
    const log_meta = {
        module: 'discord-common-interface-handler',
        command_name: common_interaction.command_name,
        platform: common_interaction.platform,
        interaction: common_interaction
    };
    const logger = require('../logger').child(log_meta);
    common_interaction.logger = logger.child({ ...log_meta, module: `common-handler-${common_interaction.command_name}` });

    logger.info(`Received callback: ${common_interaction.data}`);

    interaction.deferUpdate()
    .then(() => handle(common_interaction))
    .then(transformOverrides)
    .then(response => {
        if (response.text) {
            response.text = response.text.replace(/\n|\\n/gm, '<br/>');
            response.text = turndownService.turndown(response.text);
            response.text = response.text.replace(/( *\n *){2,}/gm, '\n\n')
        }
        return answerCallback(interaction, response);
    })
}

module.exports = {
    commonizeInteraction,
    handleCommand,
    handleCallback,
};