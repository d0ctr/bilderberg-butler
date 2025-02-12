const { sep: PATH_SEPARATOR } = require('node:path');

const { createLogger, format, transports } = require('winston');
const LokiTransport = require('winston-loki');

const ENABLE_LOKI = process.env.ENABLE_LOKI === 'true';
const LOGLEVEL = [
    'silly',
    'debug',
    'verbose',
    'http',
    'info',
    'warn',
    'error',
].includes(process.env.DEFAULT_LOGLEVEL) ? process.env.DEFAULT_LOGLEVEL : 'info';

const token_values = Object.entries(process.env).reduce((acc, [name, value]) => {
    if (name.endsWith('_TOKEN') && value.length) {
        acc.push(value)
    }
    return acc;
}, []);

const replaceToken = format((options) => {
    for (let key of Object.keys(options)) {
        if (typeof options[key] !== 'string') continue;
        token_values.forEach(token => {
            options[key] = options[key].replaceAll(token, '***')
        });
    }
    return options;
});

const formatModule = format(options => {
    if (typeof options['module'] === 'string') {
        options['module'] = options['module'].split(PATH_SEPARATOR).pop();
        if (options['module'].endsWith('.js')) {
            options['module'] = options['module'].slice(0, -3);
        }
    }
    return options;
});

const logger_options = {
    transports: [
        new transports.Console({
            format: format.combine(
                replaceToken(),
                formatModule(),
                format.timestamp(),
                format.colorize(),
                format.printf(options => {
                    return `${options.timestamp} - ${options.module} - ${options.level} - ${options.level === 'error' ? options.message : options.message.replace(/\n/gm, '\\n')}\
${options.error ? ` : ${typeof options.error === 'object' ? JSON.stringify(options.error) : options.error}` : ''}`;
                })
            ),
            level: LOGLEVEL,
        }),
    ]
};

if (process.env?.ENV === 'dev') {
    logger_options.transports.push(
        new transports.File({
            format: format.combine(
                replaceToken(),
                formatModule(),
                format.timestamp(),
                format.json()
            ),
            level: 'silly',
            filename: `combined.log`
        })
    )
} 

if (ENABLE_LOKI) {
    const { 
        LOKI_HOST = '',
        LOKI_LABELS = '',
        LOKI_USER = '',
        LOKI_PASS = '',
        RAILWAY_GIT_COMMIT_MESSAGE: LAST_COMMIT,
        LOKI_LOGLEVEL = LOGLEVEL
    } = process.env;

    const VERSION = require('./package.json').version;

    logger_options.transports.push(
        new LokiTransport({
            host: LOKI_HOST,
            json: true,
            labels: {
                ...JSON.parse(LOKI_LABELS),
                version: VERSION,
                last_commit: LAST_COMMIT,
            },
            basicAuth: `${LOKI_USER}:${LOKI_PASS}`,
            format: format.combine(
                replaceToken(),
                format.json()
            ),
            level: LOKI_LOGLEVEL,
        })
    )
}

module.exports = createLogger(logger_options);