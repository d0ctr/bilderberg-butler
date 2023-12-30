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

module.exports = {
    urlStartRegex, russianAlphabetRegex, invisibleSymbol, getInvisibleLink, genKey
}

/** @typedef { (import('./telegram').TelegramInteraction | import('./discord').DiscordInteraction) & { logger: import('../logger') }} Interaction */