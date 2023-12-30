const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const definitions = [];
const handlers = [];
const conditions = [];
const callbacks = [];

fs.readdirSync(path.join(__dirname, 'handlers')).forEach(handler_file => {
    if (!handler_file.endsWith('.js')) {
        return;
    }

    let temp_import = require(`${__dirname}/handlers/${handler_file}`);
    definitions.push(temp_import.definition);
    commands.push(temp_import.definition.command_name);
    handlers.push(temp_import.handler);
    conditions.push(temp_import.condition);
    callbacks.push(temp_import.callback)
});

module.exports = {
    commands,
    definitions,
    handlers,
    conditions,
    callbacks
};

