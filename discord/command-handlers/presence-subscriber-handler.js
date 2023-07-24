const { isActive, create, stop } = require('../presence-subscriber');
const { testPermissions } = require('../../telegram/presence-subscriber');

async function presence(input) {
    if (!input.guild) {
        return {
            type: 'text',
            text: 'Эту команду можно использовать только на сервере.'
        }
    }
    if (!input.options.getString('telegram_chat_id')) {
        return {
            type: 'text',
            text: 'Нужно указать чат, в котором нужно автоматически менять тайтл.'
        }
    }
    if (!input.options.getString('telegram_user_id')) {
        return {
            type: 'text',
            text: 'Нужно указать пользователя, у которого нужно автоматически менять тайтл.'
        }
    }

    let telegram_chat_id = input.options.getString('telegram_chat_id');
    let telegram_user_id = input.options.getString('telegram_user_id');
    
    if (isActive(input.member, input.options.getString('telegram_chat_id'))) {
        return {
            type: 'text',
            text: 'Этот пользователь уже получает автоматическое обновления тайтла в указанном чате.'
        };
    }

    if (!(await testPermissions(telegram_chat_id))) {
        return {
            type: 'text',
            text: 'Бот не может изменять описание указанного чата, удостоверьтесь, что бот добавлен в групповой чат и имеет право менять инвормацию о чате.'
        };
    }

    create(input.member, telegram_chat_id, telegram_user_id);

    return {
        type: 'text',
        text: `Теперь активность пользователя ${input.member.user.username} будет автоматически обновлять тайтл в чате \`${telegram_chat_id}\`.`
    };
}

async function unpresence(input) {
    if (!input.guild) {
        return {
            type: 'text',
            text: 'Эту команду можно использовать только на сервере.'
        }
    }

    if (!isActive(input.member)) {
        return {
            type: 'text',
            text: 'Этот пользователь не получает автоматическое обновления тайтла.'
        };
    }

    let telegram_chat_id = input.options.getString('telegram_chat_id');
    stop(input.member, telegram_chat_id);

    if (telegram_chat_id) {
        return {
            type: 'text',
            text: `Автоматическое обновление тайтла в чате \`${telegram_chat_id}\` для пользователя ${input.member.user.username} отключено.`
        };
    }
    return {
        type: 'text',
        text: `Автоматическое обновление тайтла для пользователя ${input.member.user.username} отключено.`
    };
}

module.exports = {
    presence,
    unpresence
};