const config = require('../../config.json');
const { getCurrencyObject, getConversion, getCurrenciesList } = require('../../services/currency');

const definition = {
    command_name: 'cur',
    args: [
        {
            name: 'amount',
            type: 'string',
            description: 'Сумма для конвертации.'
        },
        {
            name: 'from',
            type: 'string',
            description: 'Валюта из которой конвертировать.'
        },
        {
            name: 'to',
            type: 'string',
            description: 'Валюта в которую конвертировать.'
        }
    ],
    limit: 3,
    description: 'Возвращает результат конвертации суммы из одной валюты в другую.',
    is_inline: true,
};

const condition = (
    process.env.COINMARKETCAP_TOKEN 
    && config.COINMARKETCAP_API
) || false;

/**
 * `/cur` command handler
 * @param {Object} interaction
 * @returns {Object} 
 */

async function handler(interaction) {
    const args = interaction.args && interaction.args.slice(0, 3);
    if (!args.length) {
        return {
            type: 'error',
            text: `А где аргументы?\nПример использования <code>/cur 1 USD TRY</code>`
        };
    }

    let amount = Number(args[0]);
    if(isNaN(amount)) {
        return {
            type: 'error',
            text: `Неправильный первый аргумент, вместо <b>${args[0]}</b> должно быть число\nПример использования <code>/cur 1 USD TRY</code>`
        };
    }

    let from = getCurrencyObject(args[1].toUpperCase());
    if (!from) {
        return {
            type: 'error',
            text: `Не могу найти валюту <b>${args[1]}</b>\nПример использования <code>/cur 1 USD TRY</code>\nВот полная версия <a href="https://coinmarketcap.com/converter/">конвертора</a>`
        };
    }

    let to = getCurrencyObject(args[2].toUpperCase());
    if (!to) {
        return {
            type: 'error',
            text: `Не могу найти валюту <b>${args[2]}</b>\nПример использования <code>/cur 1 USD TRY</code>\nВот полная версия <a href="https://coinmarketcap.com/converter/">конвертора</a>`
        };
    }

    let result = null;
    try {
        result = await getConversion(amount, from.id, to.id);
    }
    catch (err) {
        interaction.logger.error(`Error while converting currency`, { interaction, error: err.stack || err });
        return {
            type: 'error',
            text: `Что-то пошло не так\nВот полная версия <a href="https://coinmarketcap.com/converter/">конвертора</a>`
        };
    }

    if(!result) {
        return {
            type: 'error',
            text: `Что-то пошло не так\nВот полная версия <a href="https://coinmarketcap.com/converter/">конвертора</a>`
        };
    }

    return {
        type: 'text',
        text: `${result[from.id]} ${from.name} = ${result[to.id].toFixed(2)} ${to.name}`
    };
}

module.exports = {
    handler,
    definition,
    condition
}
