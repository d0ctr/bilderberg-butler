const axios = require('axios');
const config = require('../../config.json');

/**
 * Gets a url for random ahegao
 * Source for ahegao is https://ahegao.netlify.app/ [GitHub](https://github.com/egecelikci/ahegao)
 * @returns {Promise<String|null>}
 */

async function getAhegaoUrl() {
    let result = null;
    let ahegao_req = await axios.get(config.AHEGAO_API);
    if (ahegao_req.status !== 200) {
        return result;
    }
    result = ahegao_req.data?.msg;
    return result;
}

/**
 * `/ahegao` command handler
 * @returns {[String | null, Object | null]}
 */

async function ahegaoHandler() {
    let ahegao_url = null;
    try {
        ahegao_url = await getAhegaoUrl();
    }
    catch (err) {
        this.logger.error(`Error while getting ahegao url: ${err.stack || err}`, { error: err.stack });
        return [`Пока без ахегао, получил следующую ошибку:\n<code>${err}</code>`];
    }
    if (!ahegao_url) {
        return [`Вроде было, но не могу найти ни одно ахегао`];
    }
    if (ahegao_url.split('.').slice(-1)[0] === 'gif') {
        return [null, { type: 'animation', media: ahegao_url }];
    }
    return [null, { type: 'photo', media: ahegao_url, url: ahegao_url }];
}

module.exports = {
    ahegaoHandler
}
