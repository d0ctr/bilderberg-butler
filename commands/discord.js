const TurndownService = require('turndown');
const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, MessagePayload } = require('discord.js');

/**
 * Discord Common Interface Implementation
 * @namespace Discord
 * @memberof Common
 */

/** @ignore */
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

/** 
 * @typedef {import('discord.js').Interaction} Interaction 
 */

/**
 * @typedef {object} DiscordInteraction
 * @property {'discord'} platform Interaction source platform
 * @property {string?} command_name Command name
 * @property {string} text Command input as one line
 * @property {string[]?} args Array of command args
 * @property {object} from Sender info
 * @property {string?} from.id Sender id
 * @property {string?} from.username Sender username
 * @property {string?} from.name Sender name
 * @property {object} space Info about the entity where command was triggered
 * @property {'guild' | 'private'} space.type Type of an entity
 * @property {string?} space.id Entity id
 * @property {string?} space.title Server name if entity is `guild`
 * @property {string?} space.username Sender username if entity is `private`
 * @property {string?} space.name Sender name if entity is `private`
 * @property {string} id Interaction id
 * @property {string?} data Callback query data
 * @memberof Common
 */

/**
 * 
 * @param {Interaction} interaction 
 * @param {Common.CommandDefinition} definition 
 * @returns {Common.DiscordInteraction}
 * @memberof Common.Discord
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
        common_interaction.type = 'private';
    }

    common_interaction.id = interaction.id;
    common_interaction.data = interaction.customId;

    return common_interaction;
}

/**
 * Transform response object by converting overrides to platfrom specific parameters
 * @param {object} response 
 * @returns {object} Updated response object
 * @memberof Common.Discord
 */
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

/**
 * Reply to command with text message
 * @param {Interaction} interaction Discord context
 * @param {object} response Response object
 * @param {import('../logger')} logger Logger
 * @memberof Common.Discord
 */
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

/**
 * Reply to command with embeded component
 * @param {Interaction} interaction Discord context
 * @param {object} response Response object
 * @param {import('../logger')} logger Logger
 * @memberof Common.Discord
 */
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

/**
 * Reply to command with file
 * @param {Interaction} interaction Discord context
 * @param {object} response Response object
 * @param {import('../logger')} logger Logger
 * @memberof Common.Discord
 */
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

/**
 * Command reply interface
 * @param {Interaction} interaction Discord context
 * @param {object} response Response object
 * @param {import('../logger')} logger Logger
 * @memberof Common.Discord
 */
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


/**
 * Command handler interface
 * @param {Interaction} interaction Discord context
 * @param {Common.CommandHandler} handler Handler function for command
 * @param {Common.CommandDefinition} definition Command definition
 * @memberof Common.Discord
 */
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
 * Process answer callback
 * @param {Interaction} interaction Discord context
 * @param {object} response Response object
 * @returns {Promise}
 * @memberof Common.Discord
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
        case 'delete_buttons':
            return interaction.followUp(response.text)
                .then(() => interaction.editReply({
                    components: []
                }));
        case 'edit_buttons':
            return interaction.editReply({
                components: response.components
            });
    }
}

/**
 * Callback handler interface
 * @async
 * @param {Interaction} interaction Discord context
 * @param {Common.CommandHandler} handle Handler function for callback
 * @memberof Common.Discord
 */
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