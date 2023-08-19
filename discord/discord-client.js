const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const DiscordHandler = require('./discord-handler');

const { 
    isActive: isChannelSubscriberActive,
    update: updateChannelSubscriberState,
    restore: restoreChannelSubscriber,
} = require('./channel-subscriber');

const {
    isActive: isPresenceSubscriberActive,
    update: updatePresenceSubscriberState,
    restore: restorePresenceSubscriber,
} = require('./presence-subscriber');

const {
    isActive: isEventSubscriberActive,
    update: updateEventSubscriberState,
    restore: restoreEventSubscriber,
    cleanup: cleanupEventSubscriber
} = require('./event-subscriber');

const { setHealth } = require('../services/health');
const { commands, conditions, definitions, handlers } = require('../commands/handlers-exporter');
const { handleCommand } = require('../commands/discord');

class DiscordInteraction {
    constructor(interaction, handler) {
        this.log_meta = {
            module: 'discord-interaction',
            command_name: interaction.commandName,
            discord_guild_id: interaction.guild?.id,
            discord_guild: interaction.guild?.name,
            discord_channel_id: interaction.channel?.id,
            discord_channel: interaction.channel?.name,
            discord_user_id: interaction.user?.id,
            discord_user: interaction.user?.username,
            discord_member_id: interaction.member?.id,
            discord_member: interaction.member?.displayName,
        };
        this.logger = require('../logger').child(this.log_meta);
        this.interaction = interaction;
        this.handler = handler;
        this.command_name = interaction.commandName;
        this.interaction = interaction;
        this.aborted = false;
    }

    /**
     * Response to command with some media content
     * @param {*} response 
     */
    _replyWithEmbed(response) {
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
        return this.interaction.reply(payload);
    }

    /**
     * Reply to command with some response
     * @param {*} response 
     */
    _reply(response) {        
        if (!['text', 'error'].includes(response.type)) {
            return this._replyWithEmbed(response.text);
        }

        this.logger.info(`Replying with text`);
        return this.interaction.reply(response.text);
    }

    reply() {
        if (typeof this.handler[this.command_name] !== 'function') {
            this.logger.warn(`Received nonsense, how did it get here???: ${this.interaction}`);
            return;
        }

        if (this.aborted) {
            this.logger.warn(`Aborted interaction, not replying`);
            return;
        }

        this.logger.info(`Received command: ${this.interaction}`);

        this.handler[this.command_name](this.interaction).then(response => {
            this._reply(response).then(() => {
                this.logger.debug('Replied!');
            }).catch(err => {
                this.logger.error(`Error while replying`, { error: err.stack || err });
                this._reply({
                    type: 'error',
                    text: `Что-то случилось:\n\`\`\`${err}\`\`\``
                }).then(() => {
                    this.logger.debug('Safe reply succeeded');
                }).catch(err => {
                    this.logger.error(`Safe reply failed`, { error: err.stack || err });
                });
            });
        }).catch(err => {
            this.logger.error(`Error while processing command [${this.command_name}]`, { error: err.stack || err });
            this._reply({
                type: 'error',
                text: `Что-то случилось:\n\`\`\`${err}\`\`\``
            }).catch(err => {
                this.logger.error(`Safe reply failed`, { error: err.stack || err });
            });
        });
    }
}

class DiscordClient {
    constructor(app) {
        this.app = app;
        this.log_meta = { module: 'discord-client' };
        this.logger = require('../logger').child(this.log_meta);
        this.discordjs_logger = require('../logger').child({ module: 'discordjs' });
        this.redis = app.redis;
        this.handler = new DiscordHandler();
        this.client = new Client({ 
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildVoiceStates,
                    GatewayIntentBits.GuildScheduledEvents,
                    GatewayIntentBits.GuildPresences
                ]
        });

        this.client.on('ready', () => {
            this.log_meta.discord_bot_id = this.client.application.id;
            this.log_meta.discord_bot = this.client.application.name;

            this.logger.info('Discord Client is ready.');
            setHealth('discord', 'ready');
            this.restoreData();
            this.registerCommands();
        });

        this.client.on('invalidated', () => {
            this.logger.warn('Discord Client is invalidated.');
            setHealth('discord', 'invalidated');
        });

        this.client.on('debug', info => {
            this.discordjs_logger.silly(`${info}`);
        });

        this.client.on('warn', info => {
            this.discordjs_logger.warn(`${info}`);
        });

        this.client.on('error', error => {
            this.discordjs_logger.error(`${error}`);
        });

        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;

            // Handling for common commands
            if (commands.indexOf(interaction.commandName) !== -1) {
                let index = commands.indexOf(interaction.commandName);
                if (typeof conditions[index] === 'function') {
                    if (!conditions[index]()) {
                        return;
                    }
                }
                else if (!conditions[index]) {
                    return;
                }

                return handleCommand(interaction, handlers[index], definitions[index]);
            }

            return new DiscordInteraction(interaction, this.handler).reply();
        });

        this.client.on('voiceStateUpdate', async (prev_state, new_state) => {
            if (isChannelSubscriberActive(new_state.channel)) {
                new_state.channel.fetch().then(channel => {
                    updateChannelSubscriberState(channel);
                });
            }
            if (new_state.channelId !== prev_state.channelId && isChannelSubscriberActive(prev_state.channel)) {
                prev_state.channel.fetch().then(channel => {
                    updateChannelSubscriberState(channel);
                })
            }
        });

        this.client.on('presenceUpdate', async ({}, new_state) => {
            if (isPresenceSubscriberActive(new_state.member)) {
                updatePresenceSubscriberState(new_state);
            }
        });

        this.client.on('guildScheduledEventUpdate', async ({}, new_state) => {
            if (isEventSubscriberActive(new_state.guild)) {
                updateEventSubscriberState(new_state);
            }
        });
    }

    async start() {
        if (!process.env.DISCORD_TOKEN) {
            this.logger.warn(`Token for Discord wasn't specified, client is not started.`);
            return;
        }
        return this.client.login(process.env.DISCORD_TOKEN);
    }

    async stop() {
        if (!process.env.DISCORD_TOKEN) {
            return;
        }
        this.logger.info('Gracefully shutdowning Discord client');
        this.client.destroy();
    }

    /**
     * 
     * @param {*} guild 
     * @returns 
     */
    async restorePresenceSubscribers(guild) {
        if (!guild) {
            this.logger.info(`Not enough input to restore data.`);
            return;
        }

        let member_id_keys;
        try {
            member_id_keys = await this.redis.keys(`${guild.id}:presence_subscriber:*`);
        }
        catch (err) {
            this.logger.error(`Error while getting member ids from ${guild.id}:presence_subscriber`, { error: err.stack || err });
            setTimeout(this.restorePresenceSubscribers.bind(this), 15000, guild);
            return;
        }

        member_id_keys.forEach(member_id_key => {
            const member_id = member_id_key.split(':')[2];
            const member = guild.members.resolve(member_id);
            if (isPresenceSubscriberActive(member)) {
                this.logger.info(`There is an active presence subscriber for ${member_id}, no need for restoration`);
                return;
            }

            restorePresenceSubscriber(member).then(() => {
                member.fetch().then(({ presence }) => {
                    updatePresenceSubscriberState(presence);
                }).catch(err => {
                    this.logger.error(`Error while fetching presence for ${member_id}`, { error: err.stack || err });
                });
                
            });
        });
    }

    async restoreChannelSubscribers(guild) {
        let channel_id_keys;
        try {
            channel_id_keys = await this.redis.keys(`${guild.id}:channel_subscriber:*`);
        }
        catch (err) {
            this.logger.error(`Error while getting channel ids for ${guild.id}:channel_subscriber`, { error: err.stack || err });
            setTimeout(this.restoreChannelIds.bind(this), 15000, guild);
            return;
        }

        channel_id_keys.forEach(channel_id_key => {
            const channel_id = channel_id_key.split(':')[2];
            const channel = guild.channels.resolve(channel_id);

            if (isChannelSubscriberActive(channel)) {
                this.logger.info(`There is an active channel subscriber for ${channel_id}, no need for restoration`);
                return;
            }

            restoreChannelSubscriber(channel);

            channel.fetch().then(channel => {
                updateChannelSubscriberState(channel);
            }).catch(err => {
                this.logger.error(`Error while fetching channel ${channel_id}`, { error: err.stack || err });
            });
        });
    }

    async restoreEventSubscriber(guild) {
        if (!this.redis) {
            this.logger.info("Hey! I can't revive without redis instance!");
            return;
        }
        if (isEventSubscriberActive(guild)) {
            this.logger.info(`There is an active event subscriber for ${guild.id}, no need for restoration`);
            return;
        }

        restoreEventSubscriber(guild);

        guild.scheduledEvents.fetch().then(events => {
            const existing_events_ids = [];
            events.forEach(event => {
                existing_events_ids.push(event.id);
                updateEventSubscriberState(event);
            });
            cleanupEventSubscriber(guild, existing_events_ids);
        }).catch(err => {
            this.logger.error(`Error while fetching events for ${guild.id}`, { error: err.stack || err });
        });
    }

    async restoreData () {
        if (!this.redis) {
            this.logger.info("Hey! I can't revive without redis instance!");
            return;
        }
        this.client.guilds.cache.forEach((guild) => {
            this.logger.info(`Reviving data from redis for [guild:${guild.id}]`, { discord_guild: guild.name, discord_guild_id: guild.id });
            this.restoreChannelSubscribers(guild);
            this.restorePresenceSubscribers(guild);
            this.restoreEventSubscriber(guild);
        });
    }

    parseInteractionInfo (interaction) {
        let info = {};
        if (interaction.guild) {
            info = {
                ...info,
                guild_name: interaction.guild.name,
                guild_id: interaction.guild.id
            };
        }
        
        if (interaction.member) {
            info = {
                ...info,
                member_name: interaction.member.displayName,
                member_id: interaction.member.id
            };
        }
        
        if (interaction.user) {
            info = {
                ...info,
                user_id: interaction.user.id,
                user_name: interaction.user.username,
                user_tag: interaction.user.tag
            };
        }
        
        if (interaction.commandName) {
            info = {
                ...info,
                command_name: interaction.commandName
            };
            if (interaction.options.getSubcommand(false)) {
                info = {
                    ...info,
                    subcommand_name: interaction.options.getSubcommand()
                };
            }
        }
        
        let result = {};
        
        for (let key in info) {
            if (info[key] !== undefined) result[key] = info[key];
        }
        
        return result;
    }

    registerCommands() {
        if (!process.env.DISCORD_APP_ID) {
            return;
        }
        const { SlashCommandBuilder } = require('@discordjs/builders');
        const { REST } = require('@discordjs/rest');
        const { Routes, ChannelType } = require('discord-api-types/v10');

        const commands_list = [
            new SlashCommandBuilder() // server
                .setName('server')
                .setDMPermission(false)
                .setDescription('Получить информацию о сервере.'),

            new SlashCommandBuilder() // user
                .setName('user')
                .setDMPermission(true)
                .setDescription('Получить информацию о пользователе.'),
            
            new SlashCommandBuilder() // subscribe
                .setName('subscribe')
                .setDMPermission(false)
                .setDescription(`Подписаться на события в голосовом канале сервера`)
                .addChannelOption(input => 
                    input.setName('channel')
                        .setDescription('Голосовой канал.')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true))
                .addStringOption(input => 
                    input.setName('telegram_chat_id')
                        .setDescription('ID чата в Telegram, который будет получать уведомления.')
                        .setRequired(true)),
            
            new SlashCommandBuilder() // unsubscribe
                .setName('unsubscribe')
                .setDMPermission(false)
                .setDescription(`Отписаться от событий в голосовом канале сервера.`)
                .addChannelOption(input => 
                    input.setName('channel')
                        .setDescription('Голосовой канал.')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true))
                .addStringOption(input =>
                    input.setName('telegram_chat_id')
                        .setDescription('ID чата в Telegram.')
                        .setRequired(false)),
            
            new SlashCommandBuilder() // presence
                .setName('presence')
                .setDMPermission(false)
                .setDescription(`Подписаться на статус активности пользователя.`)
                .addStringOption(input => 
                    input.setName('telegram_chat_id')
                        .setDescription('ID чата в Telegram, который будет получать уведомления.')
                        .setRequired(true))
                .addStringOption(input => 
                    input.setName('telegram_user_id')
                        .setDescription('ID пользователя в Telegram.')
                        .setRequired(true)),
            
            new SlashCommandBuilder() // unsubscribe
                .setName('unpresence')
                .setDMPermission(false)
                .setDescription(`Отписаться от статуса активности пользователя.`)
                .addStringOption(input =>
                    input.setName('telegram_chat_id')
                        .setDescription('ID чата в Telegram.')
                        .setRequired(false)),

            new SlashCommandBuilder() // subevents
            .setName('subevents')
            .setDMPermission(false)
            .setDescription(`Подписаться на эвенты на сервере`)
            .addStringOption(input => 
                input.setName('telegram_chat_id')
                    .setDescription('ID чата в Telegram, который будет получать уведомления.')
                    .setRequired(true)),
            
            new SlashCommandBuilder() // unsubevents
                .setName('unsubevents')
                .setDMPermission(false)
                .setDescription(`Отписаться от событий в голосовом канале сервера.`)
                .addStringOption(input =>
                    input.setName('telegram_chat_id')
                        .setDescription('ID чата в Telegram.')
                        .setRequired(false)),
        ];

        definitions.forEach((definition) => {
            const slashCommand = new SlashCommandBuilder()

            slashCommand.setName(definition.command_name);

            if (definition.description) {
                slashCommand.setDescription(definition.description);
            }

            if (definition.args) {
                definition.args.forEach((arg) => {
                    switch (arg.type) {
                        case 'string':
                            slashCommand.addStringOption(option => {
                                option.setName(arg.name);
                                option.setDescription(arg.description);
                                option.setRequired(arg.optional === true ? false : true);
                                if (arg.optional) {
                                    option.setRequired(false);
                                }
                                return option;
                            });
                            break;
                        default:
                            return;
                    }
                });
            }

            commands_list.push(slashCommand);
        });

        const json = commands_list.map(command => command.toJSON());

        new REST({ version: '9' })
        .setToken(process.env.DISCORD_TOKEN)
        .put(Routes.applicationCommands(process.env.DISCORD_APP_ID), { body: json })
        .then(() => this.logger.info('Successfully registered application commands.'))
        .catch(err => this.logger.error('Error while registering application commands.', { error: err.stack || err }));
    }
}

module.exports = DiscordClient;