const { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } = require('discord.js');

class WordleScheduler {
    constructor(handler) {
        this.app = handler.app;
        this.log_meta = { module: 'wordle-scheduler' };
        this.logger = require('../logger').child(this.log_meta);
        this.wordle_url = 'https://www.nytimes.com/games/wordle/index.html';
        this.event_name = "Угадывай слово";
        this.event_selector = '#wordle'
        this.start_hour = 21;
        this.start_min = 0;
        this.event_duration_ms = (23 * 60 + 45) * 60 * 1000;
        this.running = false;
        this.redis = this.app.redis ? this.app.redis : undefined;
        this._dump_retries = 0;
        this._restore_retries = 0;
    }

    set _guild(guild) {
        this.log_meta.discord_guild_id = guild.id;
        this.log_meta.discord_guild = guild.name;
        this.__guild = guild;
    }

    get _guild() {
        return this.__guild;
    }

    async start(guild) {
        if (this.running) return;
        if (!guild) return;
        this._guild = guild;

        await this._startScheduling();
    }

    stop() {
        if(this._schedule_timeout) {
            clearInterval(this._schedule_timeout);
        }

        this.running = false;
        this.dump();
    }

    async _startScheduling() {
        let now = new Date();
        now.setUTCSeconds(0, 0);

        if ((now.getUTCHours() == this.start_hour) && (now.getUTCMinutes() >= this.start_min) || (now.getUTCHours() > this.start_hour)) {
            now.setUTCDate(now.getUTCDate() + 1);
        }
        
        this.next_start = now.setUTCHours(this.start_hour, this.start_min);

        this.next_end = now.setTime(now.getTime() + this.event_duration_ms);

        await this._guild.scheduledEvents.create({
            name: this.event_name, 
            scheduledStartTime: this.next_start, 
            scheduledEndTime: this.next_end, 
            privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
            entityType: GuildScheduledEventEntityType.External,
            entityMetadata: { location: this.wordle_url }
        });

        this._schedule_timeout = setTimeout(this._startScheduling.bind(this), this.next_end - Date.now());
        
        this.running = true;
        
        this.dump();
    }

    async dump() {
        if (!this.redis) {
            return;
        }
        this.redis.hmset(`${this._guild.id}:wordle`, {
            event_name: this.event_name,
            event_selector: this.event_selector,
            next_start: this.next_start,
            next_end: this.next_end,
            running: this.running
        }).catch(err => {
            this.logger.error(`Error while dumping data for ${this._guild.id}:wordle: ${err.stack || err}`, { error: err.stack || err });
            if (this._dump_retries < 15) {
                this.logger.info(`Retrying dumping data for ${this._guild.id}:wordle`);
                setTimeout(this.dump.bind(this), 15000);
                this._dump_retries += 1;
            }
            else {
                this.logger.info(`Giving up on trying to dump data for ${this._guild.id}:wordle`);
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
        if (!guild && !this._guild) {
            this.logger.error('No guild to restore data for');
            return;
        }
        else if (!this._guild && guild) {
            this._guild = guild;
        }

        let data;
        try {
            data = await this.redis.hgetall(`${this._guild.id}:wordle`);
        }
        catch (err) {
            this.logger.error(`Error while restoring data for ${this._guild.id}:wordle: ${err.stack || err}`, { error: err.stack || err });
            if (this._restore_retries < 15) {
                this.logger.info(`Retrying restoring data for ${this._guild.id}:wordle`);
                setTimeout(this.restore.bind(this), 15000);
                this._restore_retries += 1;
            }
            else {
                this.logger.info(`Giving up on trying to restore data for ${this._guild.id}:wordle`);
                this._restore_retries = 0;
            }
            return;
        }

        if (!data || !data.event_name) {
            this.logger.info(`Nothing to restore for ${this._guild.id}`);
            return;
        }
        else {
            this.logger.info(`Restored data for ${this._guild.id}: ${JSON.stringify(data)}`);
        }

        this.event_name = data.event_name;
        this.event_selector = data.event_selector;
        this.next_start = data.next_start ? new Number(data.next_start): undefined;
        this.next_end = data.next_end ? new Number(data.next_end) : undefined;
        this.running = data.running === 'true';
        
        this.logger.info(`Parsed data: ${JSON.stringify(this.getPreparedData())}`, { parsed_data: this.getPreparedData() });

        if (!this.running) {
            return;
        }

        if (this.next_end < Date.now() || !this.next_end || !this.next_start) {
            this._startScheduling();
            return;
        }
        else {
            this._schedule_timeout = setTimeout(this._startScheduling.bind(this), this.next_end - Date.now());
        }
    }

    deleteDump() {
        if (!this.redis) {
            return;
        }
        this.redis.hdel(`${this._guild.id}:wordle`, ['event_name', 'event_selector', 'next_start', 'next_end', 'running']).catch((err) => {
            this.logger.error(`Error while deleting dump for ${this._guild.id}: ${err.stack || err}`, { error: err.stack || err });
        });
    }
    
    getPreparedData() {
        let data = {};
        
        data['worlde_url'] = this.wordle_url;
        data['event_name'] = this.event_name;
        data['event_selector'] = this.event_selector;
        data['start_hour'] = this.start_hour;
        data['start_min'] = this.start_min;
        data['event_duration_ms'] = this.event_duration_ms;
        data['running'] = this.running;
        data['_dump_retries'] = this._dump_retries;
        data['_restore_retries'] = this._restore_retries;
        data['next_start'] = this.next_start;
        data['next_end'] = this.next_end;
        
        let result = {};
        
        for (let key in data) {
            if (data[key] !== undefined) result[key] = data[key]; 
        }
        return result;
    }
}

module.exports = WordleScheduler;
