const { createLogger, format, transports } = require('winston');

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.printf(options => {
            return `${options.timestamp} - ${options.module} - ${options.level} - ${options.level === 'error' ? options.message : options.message.replace(/\n/gm, '\\n').replace(/ +/gm, ' ')}`;
        })
    ),
    transports: [new transports.Console()]
});

module.exports = logger;