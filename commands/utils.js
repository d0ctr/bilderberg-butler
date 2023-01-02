const getRegex = /^[a-zA-Zа-яА-Я0-9_-]+$/g;
const urlStartRegex = /^(https*:\/\/)*/;
const russianAlphabetRegex = /[а-яА-Я]+/gm;

module.exports = {
    getRegex, urlStartRegex, russianAlphabetRegex
}
