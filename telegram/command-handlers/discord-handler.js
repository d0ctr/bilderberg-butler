const GrammyTypes = require('grammy');

/**
 * `/discord_notification` command handler
 * @param {GrammyTypes.Context | Object} input
 * @returns {[null, String]}
 */

async function sendDiscordNotification(input) {
    let message = `Отлично, можно начать работать
Теперь подпишись на канал в дискорде, указав id этого чата в команде: ${input.chat.id}`;
    return [null, message];
}

module.exports = {
    sendDiscordNotification,
}
