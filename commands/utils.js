const { v4: uuid } = require('uuid');

const urlStartRegex = /^(https*:\/\/)*/;
const russianAlphabetRegex = /[а-яА-Я]+/gm;

const invisibleSymbol = "ㅤ";

const getInvisibleLink = (link) => {
    return `<a href="${link}">${invisibleSymbol}</a>`;
}

const genKey = () => {
    return uuid().replace(/-/g, '');
}

function range(start, end, step = 1) {
    let result = [];
    for (let i = start; i < end; i += step) {
        result.push(i);
    }
    return result;
}
   

module.exports = {
    urlStartRegex, russianAlphabetRegex, invisibleSymbol, getInvisibleLink, genKey, range
}

/** @typedef { (import('./telegram').TelegramInteraction | import('./discord').DiscordInteraction) & { logger: import('../logger') }} Interaction */