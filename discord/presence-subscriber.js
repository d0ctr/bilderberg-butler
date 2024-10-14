const { BaseSubscriber } = require('./utils');
const { updatePresence } = require('../telegram/presence-subscriber');

const subscribers = {};

class PresenceSubscriber extends BaseSubscriber {
    constructor() {
        super('presence_subscriber');
    }

    set _member(member) {
        this.log_meta.discord_member_id = member?.id;
        this.log_meta.discord_channel = member?.displayName;
        this.__member = member;
    }

    get _member() {
        return this.__member;
    }

    get _dump_key() {
        return `${this._guild.id}:${this._subscriber_type}:${this._member.id}`;
    }

    async update(presence) {
        if (!this.active) {
            return;
        }

        const parsed_presence = this._parsePresence(presence);

        this.logger.debug(`Caught updated presence: ${JSON.stringify(parsed_presence)}`,
            { presence: parsed_presence }
        );

        if (this.telegram_chat_ids.length) {
            const promises = [];
            for (const telegram_chat_id of this.telegram_chat_ids) {
                promises.push(
                    updatePresence(telegram_chat_id, this.telegram_user_id, parsed_presence).catch(err => {
                        this.logger.error(
                            `Error while updating presence for ${this._member.displayName}:${this._guild.name}`,
                            { 
                                error: err.stack || err,
                                telegram_chat_id,
                                telegram_user_id: this.telegram_user_id,
                                presence: parsed_presence,
                            }
                        );
                    })
                );
            }
            return Promise.allSettled(promises);
        }
    }

    _parsePresence(presence) {
        const parsed_presence = {
            guild_id: presence.guild.id,
            guild_name: presence.guild.name,
            member_id: presence.member.id,
            member_name: presence.member.displayName,
            user_id: presence.user.id,
            user_name: presence.user.username
        };

        parsed_presence.activity = presence.activities?.[0]?.name?.toLowerCase() === 'status'
            ? presence.activities[0].details
            : presence.activities?.[0]?.name;
        if (parsed_presence.activity) parsed_presence.activity_type = presence.activities?.[0]?.type;

        return parsed_presence;
    }

    start(member, telegram_chat_id, telegram_user_id) {
        if (!telegram_chat_id || !telegram_user_id || !member) return;
        if (this.active
            && this.telegram_chat_ids
            && this.telegram_chat_ids.includes(telegram_chat_id)) return;

        this.active = true;
        this.telegram_chat_ids.push(telegram_chat_id);
        if (!this.telegram_user_id) {
            this.telegram_user_id = telegram_user_id;
        }
        this._member = member;
        this._guild = member.guild;
        this.update(member.presence);
        this.dump();
    }

    stop(member, telegram_chat_id) {
        let deleted_telegram_chat_ids = telegram_chat_id ? [telegram_chat_id] : this.telegram_chat_ids;
        
        if (telegram_chat_id && this.telegram_chat_ids.length) {
            delete this.telegram_chat_ids[this.telegram_chat_ids.indexOf(telegram_chat_id)];
        }
        else {
            this.telegram_chat_ids = [];
        }

        deleted_telegram_chat_ids.forEach((telegram_chat_id) => {
            updatePresence(
                telegram_chat_id,
                this.telegram_user_id,
                { ...this._parsePresence(member.presence), activity: null }
            ).then(() => {
                this.logger.silly(
                    `Deleting presence of ${this._member.displayName}:${this._guild.name}`,
                    {
                        telegram_chat_id,
                        telegram_user_id: this.telegram_user_id,
                    }
                );
            }).catch((err) => {
                this.logger.error(
                    `Error while deleting presence for ${this._member.displayName}:${this._guild.name}`,
                    { 
                        error: err.stack || err,
                        telegram_chat_id,
                        telegram_user_id: this.telegram_user_id,
                    }
                );
            });
        });
        
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
            telegram_chat_ids: this.telegram_chat_ids.length ? JSON.stringify(this.telegram_chat_ids) : null,
            telegram_user_id: this.telegram_user_id,
        }).catch(err => {
            this.logger.error(`Error while dumping data for ${this._guild.id}:presence_subscriber${this._member.id}`, { error: err.stack || err });
            if (this._dump_retries < 15) {
                this.logger.info(`Retrying dumping data for ${this._guild.id}:presence_subscriber${this._member.id}`);
                setTimeout(this.dump.bind(this), 15000);
                this._dump_retries += 1;
            }
            else {
                this.logger.info(`Giving up on trying to dump data for ${this._guild.id}:presence_subscriber${this._member.id}`);
                this._dump_retries = 0;
            }
        }).then(res => {
            if (res) {
                this._dump_retries = 0;
            }
        });
    }

    async restore(member) {
        if (!this.redis) {
            return;
        }
        if (!member && !this._guild && !this._member) {
            this.logger.warn('Not enough input values to restore data.', { ...this.log_meta });
            return;
        }
        this._member = member;
        this._guild = member.guild;

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
                this.logger.info(`Giving up on trying to restore data for ${this._guild.id}:presence_subscriber:${this._member.id}`, { ...this.log_meta });
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
        this.telegram_chat_ids = data.telegram_chat_ids.length ? Array.from(JSON.parse(data.telegram_chat_ids)) : [];
        this.telegram_user_id = data.telegram_user_id;
        
        this.logger.info(`Parsed data: ${JSON.stringify({ active: this.active, telegram_chat_ids: this.telegram_chat_ids, telegram_user_id: this.telegram_user_id })}`, { parsed_data: JSON.stringify({ active: this.active, telegram_chat_ids: this.telegram_chat_ids, telegram_user_id: this.telegram_user_id }), ...this.log_meta });
    }

    deleteDump() {
        if (!this.redis) {
            return;
        }
        this.redis.del(this._dump_key).catch((err) => {
            this.logger.error(`Error while deleting dump for ${this._guild.id}`, { error: err.stack || err });
        });
    }
}

const isActive = (member, telegram_chat_id) => {
    if (!member) {
        return false;
    }

    let key = `${member.guild.id}:${member.id}`;

    if (!subscribers[key]?.active) {
        return false;
    }
    if (telegram_chat_id && !subscribers[key].telegram_chat_ids.includes(telegram_chat_id)) {
        return false;
    }

    return true;
};

const create = (member, telegram_chat_id, telegram_user_id) => {
    if (!member || !telegram_chat_id || !telegram_user_id) {
        return;
    }

    let key = `${member.guild.id}:${member.id}`;

    if (isActive(member, telegram_chat_id)) {
        return;
    }

    if (!subscribers[key]) {
        subscribers[key] = new PresenceSubscriber(member);
    }

    subscribers[key].start(member, telegram_chat_id, telegram_user_id);
};

const stop = (member, telegram_chat_id) => {
    if (!member) {
        return;
    }

    let key = `${member.guild.id}:${member.id}`;

    if (!isActive(member, telegram_chat_id)) {
        return;
    }

    subscribers[key].stop(member, telegram_chat_id);
}

const update = async (presence) => {
    if (!presence) {
        return;
    }

    let key = `${presence.guild.id}:${presence.member.id}`;

    return subscribers[key].update(presence);
}

const restore = async (member) => {
    if (!member) {
        return;
    }

    let key = `${member.guild.id}:${member.id}`;

    subscribers[key] = new PresenceSubscriber();
    return subscribers[key].restore(member);
};

module.exports = {
    PresenceSubscriber,
    isActive,
    create,
    stop,
    update,
    restore,
};