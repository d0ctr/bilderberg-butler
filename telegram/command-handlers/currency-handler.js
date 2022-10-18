const {default: axios} = require("axios");
const config = require("../../config.json");

async function getConversion(amount, from_id, to_id) {
    let result = null;

    let res = await axios.get(
        `${config.COINMARKETCAP_API}/v2/tools/price-conversion`,
        {
            params: {
                amount: amount,
                id: from_id,
                convert_id: to_id
            },
            headers: { 'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_TOKEN }
        }
    );

    if (res.status !== 200) {
        new Error(`${res.data.status?.error_code == 0 ? res.data.status.error_message : res.statusText}`);
        return result;
    }

    if (!res.data.data.quote[to_id]?.price) {
        return result;
    }

    result = {
        [from_id]: Number(res.data.data.amount),
        [to_id]: Number(res.data.data.quote[to_id]?.price)
    }

    return result;
}

/**
 * `/cur` command handler
 * @param {GrammyTypes.Context | Object} input
 * @returns {[String | null, Object | null]} [error, answer]
 */

async function convertCurrency(input, interaction) {
    let args = this._parseArgs(input, 3).slice(1);
    if (!args.length) {
        return [`А где аргументы?\nПример использования <code>/cur 1 USD TRY</code>`];
    }
    let amount = Number(args[0]);
    if(isNaN(amount)) {
        return [`Неправильный первый аргумент, вместо <b>${args[0]}</b> должно быть число\nПример использования <code>/cur 1 USD TRY</code>`];
    }
    let from = interaction.getCurrency(args[1].toUpperCase());
    if (!from) {
        return [`Не могу найти валюту <b>${args[1]}</b>\nПример использования <code>/cur 1 USD TRY</code>\nВот полная версия <a href="https://coinmarketcap.com/converter/">конвертора</a>`];
    }
    let to = interaction.getCurrency(args[2].toUpperCase());
    if (!to) {
        return [`Не могу найти валюту <b>${args[2]}</b>\nПример использования <code>/cur 1 USD TRY</code>\nВот полная версия <a href="https://coinmarketcap.com/converter/">конвертора</a>`];
    }
    let result = null;
    try {
        result = await getConversion(amount, from.id, to.id);
    }
    catch (err) {
        this.logger.error(`Error while converting currency: ${err.stack}`);
        return [`Что-то пошло не так\nВот полная версия <a href="https://coinmarketcap.com/converter/">конвертора</a>`];
    }
    if(!result) {
        return [`Что-то пошло не так\nВот полная версия <a href="https://coinmarketcap.com/converter/">конвертора</a>`];
    }
    return [null, `${result[from.id]} ${from.name} = ${result[to.id].toFixed(2)} ${to.name}`, `${result[to.id].toFixed(2)}`];
}

module.exports = {
    convertCurrency,
}
