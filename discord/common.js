const { getRedis } = require('../services/redis');

/**
 * @namespace Common
 * @memberof Discord
 */

/**
 * BaseSubscriber
 * @class
 * @describtion Base class for event subscriber
 * @memberof Discord.Common
 */
class BaseSubscriber {
    constructor(subscriber_type) {
        this._subscriber_type = subscriber_type;
        this.log_meta = { module: this._subscriber_type };
        this.logger = require('../logger').child(this.log_meta);
        this.redis = getRedis() || null;
        this.active = false;
        this.telegram_chat_ids = [];
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

    get _dump_key() {
        return `${this._guild?.id}:${this._subscriber_type}`;
    }
}

exports.BaseSubscriber = BaseSubscriber;