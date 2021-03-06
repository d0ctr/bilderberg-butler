const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes, ChannelType } = require('discord-api-types/v10');
const dotenv = require('dotenv');

dotenv.config();

const commands = [
	new SlashCommandBuilder() // ping
        .setName('ping')
        .setDescription('Replies with pong!'),

	new SlashCommandBuilder() // server
        .setName('server')
        .setDescription('Replies with server info!'),

	new SlashCommandBuilder() // user
        .setName('user')
        .setDescription('Replies with user info!'),
    
    new SlashCommandBuilder() // subscribe
        .setName('subscribe')
        .setDescription("Subscribe for events in server's voice channel")
        .addChannelOption(input => 
            input.setName('channel')
                .setDescription('Voice Channel to subscribe to')
                .addChannelType(ChannelType.GuildVoice)
                .setRequired(true))
        .addStringOption(input => 
            input.setName('telegram_chat_id')
                .setDescription('ID of the Telegram Chat, that will receive notifications')
                .setRequired(true)),
    
    new SlashCommandBuilder() // unsubscribe
        .setName('unsubscribe')
        .setDescription("Unsubscribe from events in server's voice channel")
        .addChannelOption(input => 
            input.setName('channel')
                .setDescription('Voice Channel to unsubscribe from')
                .addChannelType(ChannelType.GuildVoice)
                .setRequired(true)),

    new SlashCommandBuilder() // wordle
        .setName('wordle')
        .setDescription('Wordle scheduler')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start Wordle Scheduler'))
        .addSubcommand(subcommand => 
            subcommand
                .setName('stop')
                .setDescription('Stop Wordle Scheduler'))
        .addSubcommand(subcommand => 
            subcommand
                .setName('status')
                .setDescription('Show info about Wordle Scheduler'))
        .addSubcommand(subcommand => 
            subcommand
                .setName('clearall')
                .setDescription('WARNING!!! Will clear all scheduled events'))
        .addSubcommand(subcommand => 
            subcommand
                .setName('whitelist')
                .setDescription('WARNING!!! Will clear all scheduled events and schedulers'))
        
].map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

rest.put(Routes.applicationCommands(process.env.APP_ID), { body: commands })
	.then(() => console.log('Successfully registered application commands.'))
	.catch(console.error);