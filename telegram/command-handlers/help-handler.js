/**
 * `/help` command handler
 * @returns {[null, String | null]}
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
