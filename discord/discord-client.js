const { Client, GatewayIntentBits } = require('discord.js');
const Handler = require('./discord-handler');
const WordleScheduler = require('./wordle-scheduler');
const ChannelSubscriber = require('./channel-subscriber');

class DiscordClient {
    constructor(app) {
        this.app = app;
        this.log_meta = { module: 'discord-client' };
        this.logger = require('../logger').child(this.log_meta);
        this.discordjs_logger = require('../logger').child({ module: 'discordjs' });
        this.redis = app.redis;
        this.handler = new Handler(this);
        this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
        this.guild_to_wordle = {};
        this.channel_to_subscriber = {};


        this.client.on('ready', () => {
            this.log_meta.discord_bot_id = this.client.application.id;
            this.log_meta.discord_bot = this.client.application.name;

            this.logger.info('Discord Client is ready.');
            this.health = 'ready';
            this.restoreData();
        });

        this.client.on('invalidated', () => {
            this.logger.warn('Discord Client is invalidated.');
            this.health = 'invalidated';
        })

        this.client.on('debug', info => {
            this.discordjs_logger.debug(`${info}`);
        });

        this.client.on('warn', info => {
            this.discordjs_logger.warn(`${info}`);
        })

        this.client.on('error', error => {
            this.discordjs_logger.error(`${error}`);
        })

        this.client.on('interactionCreate', async interaction => {
            this.logger.info(`Discord client received: ${JSON.stringify(this.parseInteractionInfo(interaction))}`, { event: 'interactionCreate', interaction: this.parseInteractionInfo(interaction) });
            
            interaction.parsed_interaction = this.parseInteractionInfo(interaction);

            if (!interaction.isChatInputCommand()) return;
            try {
                await this.handler.handleCommand(interaction);
            }
            catch (err) {
                this.logger.error(`Error while processing discord command: ${err.stack || err}`, { error : err, event: 'interactionCreate', interaction: this.parseInteractionInfo(interaction) });
                await interaction.editReply('Opps! Something broke on my side.');
            }
        });

        this.client.on('voiceStateUpdate', async (prev_state, new_state) => {
            if(this.channel_to_subscriber[new_state.channelId]) {
                new_state.channel.fetch().then(channel => {
                    this.channel_to_subscriber[new_state.channelId].update(channel);
                });
            }
            if (new_state.channelId !== prev_state.channelId && this.channel_to_subscriber[prev_state.channelId]) {
                prev_state.channel.fetch().then(channel => {
                    this.channel_to_subscriber[prev_state.channelId].update(channel);
                })
            }
        });
    }

    set health(value) {
        this.app.health.discord = value;
    }

    get health() {
        return this.app.health.discord;
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

    async restoreWordle(guild) {
        if (this.guild_to_wordle[guild.id]) {
            this.logger.info(`There is an active Wordle instance for ${guild.id}, no need for restoration`);
            return;
        }
        if (!this.redis) {
            this.logger.info("Hey! I can't revive without redis instance!");
            return;
        }
    
        this.guild_to_wordle[guild.id] = new WordleScheduler(this);
        this.guild_to_wordle[guild.id].restore(guild);
    }

    async restoreChannelSubscriber(guild, channel_id) {
        if (!guild && !channel_id) {
            this.logger.info(`Not enough input to restore data.`);
            return;
        }
        if (this.channel_to_subscriber[channel_id]) {
            this.logger.info(`There is an active channel subscriber for ${channel_id}, no need for restoration`);
            return;
        }
        if (!this.redis) {
            this.logger.info("Hey! I can't revive without redis instance!");
            return;
        }
        this.channel_to_subscriber[channel_id] = new ChannelSubscriber(this);
        this.channel_to_subscriber[channel_id].restore(guild, channel_id);
        try {
            this.client.guilds.cache.get(guild.id).channels.cache.get(channel_id).fetch().then(channel => {
                this.channel_to_subscriber[channel_id].update(channel);
            });
        }
        catch (err) {
            this.logger.error(`Error while getting current state of [channel:${channel_id}] in [guild:${guild.id}]: ${err.stack || err}`);
        }
    }

    async restoreChannelIds(guild) {
        if (!this.redis) {
            this.logger.info("Hey! I can't revive without redis instance!");
            return;
        }
        let channel_ids;
        try {
            channel_ids = await this.redis.keys(`${guild.id}:channel_subscriber:*`);
        }
        catch (err) {
            this.logger.error(`Error while getting channel ids for ${guild.id}:channel_subscriber: ${err.stack || err}`, { error: err.stack || err });
            setTimeout(this.restoreChannelIds.bind(this), 15000, guild);
            return;
        };

        for (let i in channel_ids) {
            channel_ids[i] = channel_ids[i].split(':')[2];
        }

        for (let channel_id of channel_ids) {
            this.restoreChannelSubscriber(guild, channel_id).catch(err => {
                this.logger.error(`Error while restoring channel subscriber: ${err.stack || err}`, { error: err.stack || err });
            });
        }
    }

    async restoreData () {
        this.client.guilds.cache.map((guild) => {
            this.logger.info(`Found myself in ${guild.name}:${guild.id}`);
            this.logger.info('Reviving database for ^^^')
            this.restoreWordle(guild);
            this.restoreChannelIds(guild);
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
}

module.exports = DiscordClient;