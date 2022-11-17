function isDifferent(obj1, obj2) {
    if (Object.keys(obj1).length !== Object.keys(obj2).length) {
        return true;
    }

    for(const [k, v] of Object.entries(old_state)) {
        if (typeof obj1[k] === 'object' && typeof obj2[k] === 'object') {
            if(isDifferent(obj1[k], obj2[k])) return true;
        }
        else {
            if (obj1[k] !== obj2[k]) return true;
        }
    }
    return false;
}

function replacer(key, value) {
    if (value instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(value.entries()), // or with spread: value: [...value]
        };
    }
    else {
        return value;
    }
}

function reviver(key, value) {
    if (typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
            return new Map(value.value);
        }
    }
    return value;
}

class ChannelSubscriber {
    constructor(handler) {
        this.handler = handler;
        this.app = handler.app;
        this.logger = require('../logger').child({ module: 'channel-subscriber' });
        this.redis = this.app.redis ? this.app.redis : null;
        this.active = false;
        this.telegram_chat_ids = [];
        this.last_state = null;
        this._dump_retries = 0;
        this._restore_retries = 0;
    }
    
    async notify(state) {
        if (!this.active) {
            return;
        }

        const parsed_state = this._parseState(await state.channel.fetch());

        if (this.last_state && (!isDifferent(state, this.last_state) || !isDifferent(this.last_state, state))) {
            return;
        }

        this.logger.info(`Catched updated voice channel state: ${JSON.stringify(parsed_state, replacer)}`);
        
        if (parsed_state && this.telegram_chat_ids) {
            this.telegram_chat_ids.forEach((telegram_chat_id) => {
                this.app.telegram_client.sendNotification(parsed_state, telegram_chat_id).catch(err => {
                    this.logger.error(`Couldn't send notification for ${this._guild.name}:${this._channel.name}: ${err && err.stack}`);
                });
            });
        }
    }

    _parseState(state) {
        if (!state) return;

        let parsed_state = {};

        parsed_state.channel_id = state.id;
        parsed_state.channel_name = state.name;
        parsed_state.channel_url = state.url;
        parsed_state.channel_type = state.type;

        parsed_state.members = new Map();
        
        state.members.forEach((member, key) => {
            parsed_state.members.set(key, {
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
            last_state: JSON.stringify(this.last_state, replacer)
        }).catch(err => {
            this.logger.error(`Error while dumping data for ${this._guild.id}:channel_subscriber: ${err.stack}`);
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

    async restore(guild, channel_id) {
        if (!this.redis) {
            return;
        }
        if (!guild && !this._guild && !channel_id) {
            this.logger.error('Not enough input values to restore data.');
            return;
        }
        else if (!this._guild && guild) {
            this._guild = guild;
        }
        this._channel = this._guild.channels.resolve(channel_id);

        let data;
        try {
            data = await this.redis.hgetall(`${this._guild.id}:channel_subscriber:${this._channel.id}`);
        }
        catch (err) {
            this.logger.error(`Error while restoring data for ${this._guild.id}:channel_subscriber:${this._channel.id}: ${err.stack}`);
            if (this._restore_retries < 15) {
                this.logger.info(`Retrying restoring data for ${this._guild.id}:channel_subscriber:${this._channel.id}`);
                setTimeout(this.restore.bind(this), 15000);
                this._restore_retries += 1;
            }
            else {
                this.logger.info(`Giving up on trying to restore data for ${this._guild.id}:channel_subscriber:${this._channel.id}`);
                this._restore_retries = 0;
            }
            return;
        }

        if (!data || !data.active) {
            this.logger.info(`Nothing to restore for ${this._guild.id}:channel_subscriber:${this._channel.id}`);
            return;
        }
        else {
            this.logger.info(`Restored data for ${this._guild.id}: ${JSON.stringify(data)}`);
        }

        this.active = data.active === 'true';
        this.telegram_chat_ids = data.telegram_chat_ids && JSON.parse(data.telegram_chat_ids);
        this.last_state = data.last_state && JSON.parse(data.last_state, reviver);
        
        this.logger.info(`Parsed data: ${JSON.stringify({ active: this.active, telegram_chat_ids: this.telegram_chat_ids, last_state: this.last_state }, replacer)}`);
    }

    deleteDump() {
        if (!this.redis) {
            return;
        }
        this.redis.del(`${this._guild.id}:channel_subscriber:${this._channel.id}`).catch((err) => {
            this.logger.error(`Error while deleting dump for ${this._guild.id}: ${err.stack}`);
        });
    }
}

module.exports = ChannelSubscriber;