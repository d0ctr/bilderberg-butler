const { create, isActive, stop } = require('../channel-subscriber');

async function subscribe (interaction) {
    if (!interaction.guild) {
        return {
            type: 'text',
            text: `Можно подписаться только на изменения в голосовых каналах на сервере.`
        };
    }
    if (!interaction.options.getChannel('channel')) {
        return {
            type: 'text',
            text: 'Нужно указать канал, на изменения в котором хотите подписаться.'
        };
    }
    if (!interaction.options.getString('telegram_chat_id')) {
        return {
            type: 'text',
            text: 'Нужно указать чат, в который хотите получать уведомления.'
        };
    }
    
    let channel = interaction.guild.channels.resolve(interaction.options.get('channel').value);
    let telegram_chat_id = interaction.options.getString('telegram_chat_id');

    if (isActive(channel, telegram_chat_id)) {
        return {
            type: 'text',
            text: `Чат \`${telegram_chat_id}\` в телеграмме уже получает уведомления об изменениях в канале ${channel.name}.`
        };
    }
    
    create(channel, telegram_chat_id);

    return {
        type: 'text',
        text: `Подписан на события в канале ${channel.name} и буду уведомлять \`${telegram_chat_id}\`.`
    };
}

async function unsubscribe(interaction) {
    if (!interaction.guild) {
        return {
            type: 'text',
            text: `Эта команда доступна только на сервере`
        };
    }
    if (!interaction.options.getChannel('channel')) {
        return {
            type: 'text',
            text: 'Нужно указать канал, от изменений в котором хотите отписаться.'
        };
    }
    
    let channel = interaction.options.getChannel('channel');
    if (!isActive(channel)) {
        return {
            type: 'text',
            text: `Вы не подписаны на события в канале ${channel.name}.`
        };
    }
    
    let telegram_chat_id = interaction.options.getString('telegram_chat_id');
    stop(channel, telegram_chat_id);
    
    if (telegram_chat_id) {
        return {
            type: 'text',
            text: `Вы отписали чат \`${telegram_chat_id}\` от событий в канале ${channel.name}.`
        };
    }
    return {
        type: 'text',
        text: `Вы отписались от событий в канале ${channel.name}.`
    }
}

module.exports = {
    subscribe,
    unsubscribe
};