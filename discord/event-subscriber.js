const { BaseSubscriber } = require('./common');
const { sendNotification, deleteNotification } = require('../telegram/event-subscriber');

const subscribers = {};

class EventSubscriber extends BaseSubscriber {
    constructor() {
        super('event_subscriber');
    }

    start(guild, telegram_chat_id) {
        if (!guild || !telegram_chat_id) return;
        if (this.active
            && this.telegram_chat_ids
            && this.telegram_chat_ids.includes(telegram_chat_id)) return;
        this.active = true;
        this.telegram_chat_ids.push(telegram_chat_id);
        this._guild = guild;
        this.event_ids = new Set();
        this.dump();
    }

    stop(telegram_chat_id) {
        if (telegram_chat_id && this.telegram_chat_ids.length) {
            delete this.telegram_chat_ids[this.telegram_chat_ids.indexOf(telegram_chat_id)];
            this.logger.info(`Deleting event notifications for ${this._guild.name} in [chat: ${telegram_chat_id}]`);
            this.event_ids.forEach((event_id) => {
                deleteNotification(telegram_chat_id, event_id);
            });
        }
        else {
            this.logger.info(`Deleting event notifications for ${this._guild.name} in [chats: ${JSON.stringify(this.telegram_chat_ids)}]`);
            this.telegram_chat_ids.forEach((telegram_chat_id) => {
                this.event_ids.forEach((event_id) => {
                    deleteNotification(telegram_chat_id, event_id);
                });
            });
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
        return this.redis.hmset(this._dump_key, {
            active: this.active,
            telegram_chat_ids: JSON.stringify(this.telegram_chat_ids),
            event_ids: JSON.stringify(Array.from(this.event_ids))
        }).catch(err => {
            this.logger.error(`Error while dumping data for ${this._dump_key}`, { error: err.stack || err });
            if (this._dump_retries < 15) {
                this.logger.info(`Retrying dumping data for ${this._dump_key}`);
                setTimeout(this.dump.bind(this), 15000);
                this._dump_retries += 1;
            }
            else {
                this.logger.info(`Giving up on trying to dump data for ${this._dump_key}`);
                this._dump_retries = 0;
            }
        }).then(res => {
            if (res) {
                this._dump_retries = 0;
            }
        });
    }

    
    async restore(guild) {
        if (!this.redis) {
            return;
        }
        if (!guild) {
            this.logger.warn('Not enough input values to restore data.', { ...this.log_meta });
            return;
        }
        this._guild = guild;

        let data;
        try {
            data = await this.redis.hgetall(this._dump_key);
        }
        catch (err) {
            this.logger.error(`Error while restoring data for ${this._dump_key}`, { error: err.stack || err });
            if (this._restore_retries < 15) {
                this.logger.info(`Retrying restoring data for ${this._dump_key}`, { ...this.log_meta });
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
            this.logger.info(`Nothing to restore for ${this._dump_key}`, { ...this.log_meta });
            return;
        }
        else {
            this.logger.info(`Restored data for ${this._guild.id}: ${JSON.stringify(data)}`, { ...this.log_meta });
        }

        this.active = data.active === 'true';
        this.telegram_chat_ids = data.telegram_chat_ids.length ? JSON.parse(data.telegram_chat_ids) : [];
        this.event_ids = new Set(data.event_ids ? JSON.parse(data.event_ids) : []);
        
        this.logger.info(`Parsed data ${this._dump_key}`, { parsed_data: JSON.stringify({ active: this.active, telegram_chat_ids: this.telegram_chat_ids, event_ids: this.event_ids }), ...this.log_meta });
    }

    async deleteDump() {
        if (!this.redis) {
            return;
        }

        return this.redis.del(this._dump_key).catch((err) => {
            this.logger.error(`Error while deleting dump for ${this._dump_key}`, { error: err.stack || err });
        });
    }

    _parseState(event) {
        if (!event) return;

        let parsed_state = {};

        parsed_state.event_id = event.id;
        parsed_state.event_name = event.name;
        parsed_state.event_description = event.description;
        parsed_state.event_active = event.isActive();
        parsed_state.event_url = event.url;
        // parsed_state.event_cover_url = event.coverImageURL(); // very small for some reason
        parsed_state.guild_id = event.guild.id;
        parsed_state.guild_name = event.guild.name;
        parsed_state.channel_id = event.channel?.id;
        parsed_state.channel_name = event.channel?.name;
        parsed_state.channel_url = event.channel?.url;

        return parsed_state;
    }

    update(event) {
        if (!this.active) return;

        const parsed_state = this._parseState(event);

        if (!parsed_state.event_active) {
            this.event_ids.delete(parsed_state.event_id);
        }
        else {
            this.event_ids.add(parsed_state.event_id);
        }

        this.logger.debug(
            `Cought updated event state: ${JSON.stringify(parsed_state)}`,
            { state: parsed_state }
        );

        if (parsed_state && this.telegram_chat_ids.length) {
            this.telegram_chat_ids.forEach((telegram_chat_id) => {
                sendNotification(parsed_state, telegram_chat_id).catch(err => {
                    this.logger.error(
                        `Couldn't send event state notification for ${event.name}:${event.guild.name}`,
                        { error: err.stack || err }
                    );
                });
            });
        }

        this.dump();
    }

    async cleanup(existing_event_ids) {
        const unactive_event_ids = Array.from(this.event_ids).filter(event_id => !existing_event_ids.includes(event_id));

        this.logger.debug(`Deleting any existing notifications for disappeared events with ids ${JSON.stringify(unactive_event_ids)}`, { ...this.log_meta });
        unactive_event_ids.forEach(event_id => {
            this.telegram_chat_ids.forEach(telegram_chat_id => {
                deleteNotification(telegram_chat_id, event_id);
            });
        });
    }
}

const isActive = (guild, telegram_chat_id) => {
    if (!guild) {
        return false;
    }

    let key = guild.id;

    if (!subscribers[key]?.active) {
        return false;
    }
    if (telegram_chat_id && !subscribers[key].telegram_chat_ids.includes(telegram_chat_id)) {
        return false;
    }

    return true;
};

const create = (guild, telegram_chat_id) => {
    if (!guild || !telegram_chat_id) return;

    let key = guild.id;

    if (isActive(guild, telegram_chat_id)) {
        return;
    }

    if (!subscribers[key]) {
        subscribers[key] = new EventSubscriber();
    }

    subscribers[key].start(guild, telegram_chat_id);
};

const stop = (guild, telegram_chat_id) => {
    if (!guild) {
        return;
    }

    let key = guild.id;
    
    if (!isActive(guild, telegram_chat_id)) {
        return;
    }

    subscribers[key]?.stop(telegram_chat_id);
};

const update = (event) => {
    if (!event){
        return;
    }

    let key = event.guild.id;

    subscribers[key]?.update(event);
};

const restore = (guild) => {
    if (!guild) {
        return;
    }
    
    let key = guild.id;

    subscribers[key] = new EventSubscriber();
    subscribers[key].restore(guild);
};

const cleanup = (guild, existing_event_ids) => {
    if (!guild || !existing_event_ids?.length) return;

    let key = guild.id;

    subscribers[key]?.cleanup(existing_event_ids);
};

module.exports = {
    EventSubscriber,
    isActive,
    create,
    stop,
    update,
    restore,
    cleanup,
};