const WordleScheduler = require('./wordle-scheduler');
const ChannelSubscriber = require('./channel-subscriber');

class DiscordHandler {
    constructor(client) {
        this.client = client;
        this.app = client.app;
        this.logger = require('../logger').child({module: 'discord-handler'});
    }

    async handleCommand(interaction) {
        if (!this['_' + interaction.commandName]) {
            return this.reply(interaction, 'There is no such command.');
        }
        return this['_' + interaction.commandName](interaction);
    }

    async reply(interaction, message) {
        this.logger.info(`Responding with [${message.replace(/\n/gm, '\\n')}].`, { interaction: interaction.parsed_interaction, response: message })
        return await interaction.reply(message);
    }

    async _ping(interaction) {
        return this.reply(interaction, 'pong');
    }

    async _server(interaction) {
        return this.reply(interaction, `Server name: ${interaction.guild.name}\nTotal members: ${interaction.guild.memberCount}`);
    }

    async _user(interaction) {
        return this.reply(interaction, `Your username: ${interaction.user.username}\nYour ID: ${interaction.user.id}`);
    }

    async _wordle(interaction) {
        if (!this['_wordle_' + interaction.options.getSubcommand()]) {
            return this.reply(interaction, 'There is no such command.');
        }
        return this['_wordle_' + interaction.options.getSubcommand()](interaction);
    }

    async _wordle_start (interaction) {
        if (this.client.guild_to_wordle[interaction.guild.id] && this.client.guild_to_wordle[interaction.guild.id].running) {
            return this.reply(interaction, 'Scheduler is already running!');
        }

        await interaction.deferReply();

        if (!this.client.guild_to_wordle[interaction.guild.id]) this.client.guild_to_wordle[interaction.guild.id] = new WordleScheduler(this);
        await this.client.guild_to_wordle[interaction.guild.id].start(interaction.guild);
        if (this.client.guild_to_wordle[interaction.guild.id].next_start) {
            return interaction.editReply(`Starting Wordle scheduler\nNext Wordle is in ${Math.floor((this.client.guild_to_wordle[interaction.guild.id].next_start - Date.now()) / 60000)} mins, get ready!`);
        }
    }

    async _wordle_stop (interaction) {
        if (this.client.guild_to_wordle[interaction.guild.id] && this.client.guild_to_wordle[interaction.guild.id].running) {
            this.client.guild_to_wordle[interaction.guild.id].stop();

            return this.reply(interaction, 'Stopped Wordle scheduler');
        }
        else {
            return this.reply(interaction, 'There is no running scheduler right now');
        }
    }

    async _wordle_status (interaction) {
        if (this.client.guild_to_wordle[interaction.guild.id] && this.client.guild_to_wordle[interaction.guild.id].running) {
            return this.reply(interaction, `There is currently running Wordle scheduler.\nNext Wordle is in ${Math.floor((this.client.guild_to_wordle[interaction.guild.id].next_start - Date.now()) / 60000)} mins, get ready!`);
        }
        else {
            return this.reply(interaction, 'There is no currently running Wordle scheduler.\nYou can start one with `/wordle start`');
        }
    }

    async _wordle_clearall (interaction) {
        let events = await interaction.guild.scheduledEvents.fetch();
        await events.forEach(async (event) => {
            await interaction.guild.scheduledEvents.delete(event);
        });
        return this.reply(interaction, 'All events are deleted');
    }
    
    async _wordle_whitelist (interaction) {
        await interaction.deferReply();
        let events = await interaction.guild.scheduledEvents.fetch();
        await events.forEach(async (event) => {
            await interaction.guild.scheduledEvents.delete(event);
        });
        if (this.client.guild_to_wordle[interaction.guild.id]) {
            this.client.guild_to_wordle[interaction.guild.id].stop();
            this.client.guild_to_wordle[interaction.guild.id].deleteDump();
            delete this.client.guild_to_wordle[interaction.guild.id];
        }

        return interaction.editReply('Completed.');
    }

    async _subscribe (interaction) {
        if (!interaction.guild) {
            return this.reply(interaction, `You can only subscribe for events in server's channels.`);
        }
        if (!interaction.options.getChannel('channel')) {
            return this.reply(interaction, `You can't subscribe if you don't provide a channel for that.`);
        }
        if (!interaction.options.getString('telegram_chat_id')) {
            return this.reply(interaction, `You can't subscribe if you don't provide a telegram chat to notify.`);
        }
        
        let channel = interaction.guild.channels.resolve(interaction.options.get('channel').value);
        let telegram_chat_id = interaction.options.getString('telegram_chat_id');
        if (this.client.channel_to_subscriber[channel.id] 
            && this.client.channel_to_subscriber[channel.id].active
            && this.client.channel_to_subscriber[channel.id].telegram_chat_ids?.includes(telegram_chat_id)) {
            return this.reply(interaction, `There is an active subscriber for channel ${channel.name} that notifies ${telegram_chat_id}.`)
        }
        if (!this.client.channel_to_subscriber[channel.id]) {
            this.client.channel_to_subscriber[channel.id] = new ChannelSubscriber(this);
        }
        this.client.channel_to_subscriber[channel.id].start(channel, telegram_chat_id);

        return this.reply(interaction, `Subscribed for events in channel ${channel.name} and will notify ${telegram_chat_id}.`);
    }

    async _unsubscribe(interaction) {
        if (!interaction.guild) {
            return this.reply(interaction, `You can only subscribe from events in server's channels.`);
        }
        if (!interaction.options.getChannel('channel')) {
            return this.reply(interaction, `You can't unsubscribe if you don't provide a channel for that.`);
        }
        
        let channel = interaction.options.getChannel('channel');
        if (!(this.client.channel_to_subscriber[channel.id] && this.client.channel_to_subscriber[channel.id].active)) {
            return this.reply(interaction, `There is no active subscriber for channel ${channel.name}.`)
        }
        let telegram_chat_id = interaction.options.getString('telegram_chat_id');
        if (telegram_chat_id) {
            this.client.channel_to_subscriber[channel.id].stop(telegram_chat_id);
            return this.reply(interaction, `You have unsubscribed telegram chat ${telegram_chat_id} from events in ${channel.name}.`);
        }
        this.client.channel_to_subscriber[channel.id].stop();
        return this.reply(interaction, `You have unsubscribed from events in ${channel.name}.`);
    }
}

module.exports = DiscordHandler;