const { create, isActive, stop } = require('../event-subscriber');

async function subevents (interaction) {
    if (!interaction.guild) {
        return {
            type: 'text',
            text: `Можно подписаться только на эвенты на сервере.`
        };
    }
    if (!interaction.options.getString('telegram_chat_id')) {
        return {
            type: 'text',
            text: 'Нужно указать чат, в который хотите получать уведомления.'
        };
    }

    let telegram_chat_id = interaction.options.getString('telegram_chat_id');

    if (isActive(interaction.guild, telegram_chat_id)) {
        return {
            type: 'text',
            text: `Чат \`${telegram_chat_id}\` в телеграмме уже получает уведомления об эвентах на сервере.`
        }
    }
    
    create(interaction.guild, telegram_chat_id);

    return {
        type: 'text',
        text: `Подписан на эвенты на сервере и буду уведомлять \`${telegram_chat_id}\`.`
    };
}

async function unsubevents(interaction) {
    if (!interaction.guild) {
        return {
            type: 'text',
            text: `Эта команда доступна только на сервере`
        };
    }
    if (!isActive(interaction.guild)) {
        return {
            type: 'text',
            text: `Вы не подписаны на эвенты на этом сервере.`
        };
    }
    
    let telegram_chat_id = interaction.options.getString('telegram_chat_id');
    stop(interaction.guild, telegram_chat_id);
    
    if (telegram_chat_id) {
        return {
            type: 'text',
            text: `Вы отписали чат \`${telegram_chat_id}\` от эвентов на сервере'.`
        };
    }
    return {
        type: 'text',
        text: `Вы отписались от эвентов на сервере.`
    }
}

module.exports = {
    subevents,
    unsubevents
};