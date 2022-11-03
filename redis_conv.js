const Redis = require('ioredis');
const { Client, GatewayIntentBits } = require('discord.js');

let redis = new Redis(process.env.REDISCLOUD_URL);

let discord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

const convertChannelSubscriber = (guild_id) => {
    redis.keys(`${guild_id}:channel_subscriber:*`).then((keys) => {
        console.log(`Found [${JSON.stringify(keys)}]`);

        keys.forEach((key) => {
            redis.hgetall(key).then((data) => {
                data.telegram_chat_ids = JSON.stringify([data.telegram_chat_id]);
                delete data.telegram_chat_id;
                console.log(JSON.stringify(data));

                redis.hset(key, data).then(() => {
                    redis.hdel(key, 'telegram_chat_id').then(() =>
                        redis.hgetall(key).then((data_) => console.log(JSON.stringify(data_)))
                    )
                });
            });
        });
    });
}

const startDiscord = () => {
    console.log('starting discord');
    discord.on('ready', () => {
        console.log('discord is ready');
        discord.guilds.cache.forEach((guild) => {
            convertChannelSubscriber(guild.id);
        });
    });

    discord.login(process.env.DISCORD_TOKEN);
};

redis.on('ready', () => {
    console.log('redis is ready');
    startDiscord();
});