const { BaseSubscriber } = require('./common');
const { setTitle, deleteTitle } = require('../telegram/presence-subscriber');

const subscribers = {};

class PresenceSubscriber extends BaseSubscriber {
    constructor() {
        super('presence_subscriber');
    }

    set _member(member) {
        this.log_meta.discord_member_id = member?.id;
        this.log_meta.discord_channel = member?.name;
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

        if (!presence?.activities?.length) {
            this.logger.info(
                'Presence has no activities, deleting title',
                {
                    telegram_chat_ids: this.telegram_chat_ids,
                    telegram_user_id: this.telegram_user_id,
                }
            );

            this.last_state_name = null;
            this.telegram_chat_ids.forEach(telegram_chat_id => {
                deleteTitle(telegram_chat_id, this.telegram_user_id).catch(err => {
                    this.logger.error(
                        `Error while deleting title for ${this.telegram_user_id} in ${telegram_chat_id}`,
                        { 
                            error: err.stack || err,
                            telegram_chat_id,
                            telegram_user_id: this.telegram_user_id,
                        }
                    );
                })
            });
            return;
        }

        const activity_name = presence.activities[0].name;

        if (activity_name !== this.last_state_name) {
            this.logger.info(
                `Presence has new activity name: ${activity_name}`,
                {
                    telegram_chat_ids: this.telegram_chat_ids,
                    telegram_user_id: this.telegram_user_id,
                    activity_name,
                }
            );

            this.telegram_chat_ids.forEach(telegram_chat_id => {
                setTitle(telegram_chat_id, this.telegram_user_id, activity_name).catch(err => {
                    this.logger.error(
                        `Error while setting title ${activity_name} for ${this.telegram_user_id} in ${telegram_chat_id}`,
                        { 
                            error: err.stack || err,
                            telegram_chat_id,
                            telegram_user_id: this.telegram_user_id,
                            activity_name,
                        }
                    );
                })
            });
        }
        
        this.last_state_name = activity_name;
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
        this.redis.hmset(`${this._guild.id}:presence_subscriber:${this._member.id}`, {
            active: this.active,
            telegram_chat_ids: JSON.stringify(this.telegram_chat_ids),
            telegram_user_id: this.telegram_user_id,
            last_state_name: this.last_state_name,
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
            data = await this.redis.hgetall(`${this._guild.id}:presence_subscriber:${this._member.id}`);
        }
        catch (err) {
            this.logger.error(`Error while restoring data for ${this._guild.id}:presence_subscriber:${this._member.id}`, { error: err.stack || err });
            if (this._restore_retries < 15) {
                this.logger.info(`Retrying restoring data for ${this._guild.id}:presence_subscriber:${this._member.id}`, { ...this.log_meta });
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
            this.logger.info(`Nothing to restore for ${this._guild.id}:presence_subscriber:${this._member.id}`, { ...this.log_meta });
            return;
        }
        else {
            this.logger.info(`Restored data for ${this._guild.id}: ${JSON.stringify(data)}`, { ...this.log_meta });
        }

        this.active = data.active === 'true';
        this.telegram_chat_ids = data.telegram_chat_ids && JSON.parse(data.telegram_chat_ids);
        this.telegram_user_id = data.telegram_user_id;
        this.last_state_name = data.last_state_name;
        
        this.logger.info(`Parsed data: ${JSON.stringify({ active: this.active, telegram_chat_ids: this.telegram_chat_ids, telegram_user_id: this.telegram_user_id, last_state_name: this.last_state_name })}`, { parsed_data: JSON.stringify({ active: this.active, telegram_chat_ids: this.telegram_chat_ids, telegram_chat_ids: this.telegram_chat_ids, last_state: this.last_state }), ...this.log_meta });
    }

    deleteDump() {
        if (!this.redis) {
            return;
        }
        this.redis.del(`${this._guild.id}:presence_subscriber:${this._member.id}`).catch((err) => {
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

const update = (presence) => {
    if (!presence) {
        return;
    }

    let key = `${presence.guild.id}:${presence.member.id}`;

    subscribers[key].update(presence);
}

const restore = (member) => {
    if (!member) {
        return;
    }

    let key = `${member.guild.id}:${member.id}`;

    subscribers[key] = new PresenceSubscriber();
    subscribers[key].restore(member);
};

module.exports = {
    PresenceSubscriber,
    isActive,
    create,
    stop,
    update,
    restore,
};