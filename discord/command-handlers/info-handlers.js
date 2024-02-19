async function server(input) {
    return {
        type: 'text',
        text: `Имя сервера: \`${input.guild.name}\`\nID: \`${input.guild.id}\`\nКоличество участников: \`${input.guild.memberCount}\``
    };
}

async function user(input) {
    return {
        type: 'text',
        text: `Имя пользователя: \`${input.user.username}\`\nID: \`${input.user.id}\``
    };
}

async function channel(input) {
    const channel = input.options.getChannel('channel');
    return {
        type: 'text',
        text: `Название канала: \`${channel.name}\`\nID: \`${channel.id}\``
    }
}

module.exports = {
    server,
    user,
    channel
};