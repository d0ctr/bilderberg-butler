/**
 * Help Command
 * @namespace help
 * @memberof Telegram.Commands
 */

/**
 * Help Command Handler
 * @param {null} ctx
 * @param {import('../telegram-client').TelegramInteraction} interaction 
 * @memberof Telegram.Commands.help
 */
async function help({}, interaction) {
    let message = 'Вот список доступных команд:\n';
    interaction.registered_commands.forEach((help, command_name) => {
        if (!help?.length) return;
        message += `/${command_name} — ${help.join(' ')}\n`;
    });
    return [null, message];
}

module.exports = {
    help,
}
