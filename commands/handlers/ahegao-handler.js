const axios = require('axios');

const config = require('../../config.json');

const definition = {
    command_name: 'ahegao',
    description: 'Возвращает случайное ахегао.',
    is_inline: true,
};

const condition = config.AHEGAO_API || false;

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
 * @param {Object?} 
 * @returns {Object}
 */

async function handler(interaction) {
    let ahegao_url = null;
    try {
        ahegao_url = await getAhegaoUrl();
    }
    catch (err) {
        interaction.logger.error(`Error while getting ahegao url`, { error: err.stack || err });
        return {
            type: 'error',
            text: `Пока без ахегао, получил следующую ошибку:\n<code>${err}</code>`
        };
    }
    if (!ahegao_url) {
        return {
            type: 'error',
            text: `Вроде было, но не могу найти ни одно ахегао`
        };
    }
    if (ahegao_url.split('.').slice(-1)[0] === 'gif') {
        return { 
            type: 'animation',
            media: ahegao_url,
            url: ahegao_url
        };
    }
    return { 
        type: 'photo',
        media: ahegao_url,
        url: ahegao_url
    };
}

module.exports = {
    handler,
    definition,
    condition
}
