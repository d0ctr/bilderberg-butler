require('dotenv-vault-core').config();

if (process.env.ENV !== 'prod') {
    require('dotenv').config();
}

const axios = require("axios");

const config = require('../config.json');

const logger = require('../logger').child({ module: 'currency' });

let currencies_list = [];

const fetchCurrenciesList = async () => {
    if (!process.env.COINMARKETCAP_TOKEN || !config.COINMARKETCAP_API) {

    }
    logger.info('Retrieving currencies list...');
    // get crypto
    let res_cryptocurrency = await axios.get(
        `${config.COINMARKETCAP_API}/v1/cryptocurrency/map`,
        {
            params: { listing_status: 'untracked,active' },
            headers: { 'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_TOKEN }
        }
    );

    const {
        status: crypto_status,
        data: {
            status: {
                error_code: crypto_error_code,
                error_message: crypto_error_message,
            },
            data: crypto_data,
        } ,
        statusText: crypto_status_text,
    } = res_cryptocurrency;

    if (crypto_status !== 200 || crypto_error_code != 0) {
        logger.error(`Error while fetching crypto currenies list: ${crypto_error_code == 0 ? crypto_error_message : crypto_status_text}`);
    }

    for (let entry of crypto_data) {
        currencies_list[entry.symbol] = {
            id: entry.id,
            name: entry.name,
            symbol: entry.symbol
        }
    }
    //get fiat
    let res_fiat = await axios.get(
        `${config.COINMARKETCAP_API}/v1/fiat/map`,
        {
            params: { include_metals: true },
            headers: { 'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_TOKEN }
        }
    );

    const {
        status: fiat_status,
        data: {
            status: {
                error_code: fiat_error_code,
                error_message: fiat_error_message,
            },
            data: fiat_data,
        },
        statusText: fiat_status_text,
    } = res_fiat;

    if (fiat_status !== 200 || fiat_error_code != 0) {
        logger.error(`Error while fetching fiat currenies list: ${fiat_error_code == 0 ? fiat_error_message : fiat_status_text}`);
    }

    for (let entry of fiat_data) {
        currencies_list[entry.symbol] = {
            id: entry.id,
            name: entry.name,
            symbol: entry.symbol
        }
    }

    logger.info('Retrieved currencies list');
    return currencies_list;
};

const getCurrenciesList = () => currencies_list;

const getCurrencyObject = (currency_name) => {
    return currencies_list ? currencies_list[currency_name] : null;
};

const getConversion = async (amount, from_id, to_id) => {
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

module.exports = {
    fetchCurrenciesList,
    getCurrenciesList,
    getCurrencyObject,
    getConversion
}