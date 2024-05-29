const { getRedis } = require('../../services/redis');
const { getHealth } = require('../../services/health');
const { getScheduled } = require('../../discord/event-subscriber')

const getKey = (chat_id) => `telegram:${chat_id}:event_subscriber:guild_ids`;

/** @type {Intl.DateTimeFormatOptions} */
const general_options = {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
}

const date_options = {
    'CET': { timeZone: 'CET', ...general_options },
    'NIC': { timeZone: 'Asia/Nicosia', ...general_options },
    'MOW': { timeZone: 'Europe/Moscow', ...general_options },
}

async function events(ctx) {
    if (getHealth('redis') != 'ready') return ['Временно не могу ответить, попробуйте позже'];
    const chat_id = ctx.chat.id;

    const redis = getRedis();
    if (!getRedis()) return ['Команда не поддерживается'];

    const exists = await redis.exists(getKey(chat_id));
    if (!exists) return [null, 'Этот чат ещё не подписан на эвенты, чтобы подписаться добавьте бота на сервер в дискорде и воспользуйтесь командой /subevents.'];

    const guild_ids = await redis.smembers(getKey(chat_id));
    if (!guild_ids.length) return [null, 'Этот чат ещё не подписан на эвенты, чтобы подписаться добавьте бота на сервер в дискорде и воспользуйтесь командой /subevents.'];

    /** @type {{ [guild_name: string]: any[] }} */
    const events_map = {};
    for (const guild_id of guild_ids) {
        const guild_events = await getScheduled(guild_id);
        if (!guild_events.length) continue;
        events_map[guild_events[0].guild_name] = guild_events;
    }

    if (!Object.keys(events_map).length) return [null, 'Нет запланированных эвентов'];

    let message = '';
    for (const [guild_name, events] of Object.entries(events_map)) {
        if (!events.length) continue;
        message += `<b>${guild_name}</b>\n`;
        for (const event of events.sort((a, b) => a.start - b.start)) {
            message += `- <b><a href="${event.event_url}">${event.event_name}</a></b>\n`;
            const start = new Date(event.start);
            message += `<code>  </code>Начало:\n`;
            message += `<code>   Аугсбург:        </code>${start.toLocaleString('ru-RU', date_options['CET'])}\n`;
            message += `<code>   Лимассол:        </code>${start.toLocaleString('ru-RU', date_options['NIC'])}\n`;
            message += `<code>   Санкт-Петербург: </code>${start.toLocaleString('ru-RU', date_options['MOW'])}\n`;
            if (!event.end) continue;
            const end = new Date(event.end);
            message += `<code>  </code>Продолжительность: ${new Date(end - start).toLocaleTimeString('ru-RU', { hour:'2-digit', minute: '2-digit' })}\n`;
        }
    }

    if (!message.length) return [null, 'Нет запланированных эвентов'];

    return [null, message];
}

module.exports = {
    events,
}