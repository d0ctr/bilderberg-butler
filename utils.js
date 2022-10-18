const axios = require('axios').default;
const config = require('./config.json');

async function get_currencies_list() {
    let currencies = {};

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
        new Error(`${crypto_error_code == 0 ? crypto_error_message : crypto_status_text}`);
        return currencies;
    }

    for (let entry of crypto_data) {
        currencies[entry.symbol] = {
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
        new Error(`${fiat_error_code == 0 ? fiat_error_message : fiat_status_text}`);
        return currencies;
    }

    for (let entry of fiat_data) {
        currencies[entry.symbol] = {
            id: entry.id,
            name: entry.name,
            symbol: entry.symbol
        }
    }

    return currencies;
}

module.exports = { get_currencies_list };