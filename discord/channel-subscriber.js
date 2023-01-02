const { sendNotification } = require('../telegram/channel-subscriber');
const { getRedis } = require('../services/redis');

const subscribers = {};

function isDifferent(obj1, obj2) {
    if (Object.keys(obj1).length !== Object.keys(obj2).length) {
        return true;
    }

    for(const k of Object.keys(obj1)) {
        if (typeof obj1[k] === 'object' && typeof obj2[k] === 'object') {
            if(isDifferent(obj1[k], obj2[k])) return true;
        }
        else {
            if (obj1[k] !== obj2[k]) return true;
        }
    }
    return false;
}

class ChannelSubscriber {
    constructor() {
        this.log_meta = { module: 'channel-subscriber' };
        this.logger = require('../logger').child(this.log_meta);
        this.redis = getRedis() || null;
        this.active = false;
        this.telegram_chat_ids = [];
        this.last_state = null;
        this._dump_retries = 0;
        this._restore_retries = 0;
    }

    set _guild(guild) {
        this.log_meta.discord_guild_id = guild?.id;
        this.log_meta.discord_guild = guild?.name;
        this.__guild = guild;
    }

    get _guild() {
        return this.__guild;
    }

    set _channel(channel) {
        this.log_meta.discord_channel_id = channel?.id;
        this.log_meta.discord_channel = channel?.name;
        this.__channel = channel;
    }

    get _channel() {
        return this.__channel;
    }
    
    async update(channel) {
        if (!this.active) {
            return;
        }

        const parsed_state = this._parseState(channel);

        if (this.last_state && (!isDifferent(parsed_state, this.last_state) || !isDifferent(this.last_state, parsed_state))) {
            return;
        }

        this.last_state = parsed_state;

        this.logger.info(
            `Catched updated voice channel state: ${JSON.stringify(parsed_state)}`,
            { state: parsed_state }
        );
        
        if (parsed_state && this.telegram_chat_ids) {
            this.telegram_chat_ids.forEach((telegram_chat_id) => {
                sendNotification(parsed_state, telegram_chat_id).catch(err => {
                    this.logger.error(
                        `Couldn't send notification for ${this._guild.name}:${this._channel.name}`,
                        { error: err.stack || err, telegram_chat_id}
                    );
                });
            });
        }
    }

    _parseState(channel) {
        if (!channel) return;

        let parsed_state = {};

        parsed_state.channel_id = channel.id;
        parsed_state.channel_name = channel.name;
        parsed_state.channel_url = channel.url;
        parsed_state.channel_type = channel.type;
        parsed_state.guild_id = channel.guild.id;
        parsed_state.guild_name = channel.guild.guild_name;


        parsed_state.members = [];
        
        channel.members.forEach((member) => {
            parsed_state.members.push({
                    user_id: member.user.id,
                    user_name: member.user.username,
                    streaming: member.voice.streaming,
                    member_id: member.id,
                    muted: member.voice.mute,
                    deafened: member.voice.deaf,
                    server_muted: member.voice.serverMute,
                    server_deafened: member.voice.serverDeaf
                });
        });

        return parsed_state;
    }

    async start(channel, telegram_chat_id) {
        if (!channel || !telegram_chat_id) return;
        if (this.active 
            && this.telegram_chat_ids
            && this.telegram_chat_ids.includes(telegram_chat_id)) return;
        this.active = true;
        this.telegram_chat_ids.push(telegram_chat_id);
        this._channel = channel;
        this._guild = channel.guild;
        this.dump();
    }

    stop(telegram_chat_id) {
        if (telegram_chat_id && this.telegram_chat_ids.length) {
            delete this.telegram_chat_ids[this.telegram_chat_ids.indexOf(telegram_chat_id)];
        }
        else {
            this.telegram_chat_ids = [];
        }
        
        if (!this.telegram_chat_ids.length) {
            this.active = false;
        }

        this.dump();
    }

    async dump() {
        if (!this.redis) {
            return;
        }
        this.redis.hmset(`${this._guild.id}:channel_subscriber:${this._channel.id}`, {
            active: this.active,
            telegram_chat_ids: JSON.stringify(this.telegram_chat_ids),
            last_state: JSON.stringify(this.last_state)
        }).catch(err => {
            this.logger.error(`Error while dumping data for ${this._guild.id}:channel_subscriber`, { error: err.stack || err });
            if (this._dump_retries < 15) {
                this.logger.info(`Retrying dumping data for ${this._guild.id}:channel_subscriber`);
                setTimeout(this.dump.bind(this), 15000);
                this._dump_retries += 1;
            }
            else {
                this.logger.info(`Giving up on trying to dump data for ${this._guild.id}:channel_subscriber`);
                this._dump_retries = 0;
            }
        }).then(res => {
            if (res) {
                this._dump_retries = 0;
            }
        });
    }

    async restore(channel) {
        if (!this.redis) {
            return;
        }
        if (!channel && !this._guild && !this._channel) {
            this.logger.warn('Not enough input values to restore data.', { ...this.log_meta });
            return;
        }
        this._channel = channel;
        this._guild = channel.guild;

        let data;
        try {
            data = await this.redis.hgetall(`${this._guild.id}:channel_subscriber:${this._channel.id}`);
        }
        catch (err) {
            this.logger.error(`Error while restoring data for ${this._guild.id}:channel_subscriber:${this._channel.id}`, { error: err.stack || err });
            if (this._restore_retries < 15) {
                this.logger.info(`Retrying restoring data for ${this._guild.id}:channel_subscriber:${this._channel.id}`, { ...this.log_meta });
                setTimeout(this.restore.bind(this), 15000);
                this._restore_retries += 1;
            }
            else {
                this.logger.info(`Giving up on trying to restore data for ${this._guild.id}:channel_subscriber:${this._channel.id}`, { ...this.log_meta });
                this._restore_retries = 0;
            }
            return;
        }

        if (!data || !data.active) {
            this.logger.info(`Nothing to restore for ${this._guild.id}:channel_subscriber:${this._channel.id}`, { ...this.log_meta });
            return;
        }
        else {
            this.logger.info(`Restored data for ${this._guild.id}: ${JSON.stringify(data)}`, { ...this.log_meta });
        }

        this.active = data.active === 'true';
        this.telegram_chat_ids = data.telegram_chat_ids && JSON.parse(data.telegram_chat_ids);
        this.last_state = data.last_state && JSON.parse(data.last_state);
        
        this.logger.info(`Parsed data: ${JSON.stringify({ active: this.active, telegram_chat_ids: this.telegram_chat_ids, last_state: this.last_state })}`, { parsed_data: JSON.stringify({ active: this.active, telegram_chat_ids: this.telegram_chat_ids, last_state: this.last_state }), ...this.log_meta });
    }

    deleteDump() {
        if (!this.redis) {
            return;
        }
        this.redis.del(`${this._guild.id}:channel_subscriber:${this._channel.id}`).catch((err) => {
            this.logger.error(`Error while deleting dump for ${this._guild.id}`, { error: err.stack || err });
        });
    }
}

const isActive = (channel, telegram_chat_id) => {
    if (!channel) {
        return false;
    };

    let key = `${channel.guild.id}:${channel.id}`;

    if (!subscribers[key]?.active) {
        return false;
    }
    if (telegram_chat_id && !subscribers[key].telegram_chat_ids.includes(telegram_chat_id)) {
        return false;
    }

    return true;
};

const create = (channel, telegram_chat_id) => {
    if (!channel || !telegram_chat_id) return;

    let key = `${channel.guild.id}:${channel.id}`;

    if (isActive(channel, telegram_chat_id)) {
        return;
    }

    if (!subscribers[key]) {
        subscribers[key] = new ChannelSubscriber(channel);
    }

    subscribers[key].start(channel, telegram_chat_id);
};

const stop = (channel, telegram_chat_id) => {
    if (!channel) {
        return;
    }

    let key = `${channel.guild.id}:${channel.id}`;
    
    if (!isActive(channel, telegram_chat_id)) {
        return;
    }

    subscribers[key].stop(channel, telegram_chat_id);
};

const update = (channel) => {
    if (!channel){
        return;
    }

    let key = `${channel.guild.id}:${channel.id}`;

    subscribers[key].update(channel);
}

const restore = (channel) => {
    if (!channel) {
        return;
    }
    
    let key = `${channel.guild.id}:${channel.id}`;

    subscribers[key] = new ChannelSubscriber();
    subscribers[key].restore(channel);
}

module.exports = {
    ChannelSubscriber,
    isActive,
    create,
    stop,
    update,
    restore,
};