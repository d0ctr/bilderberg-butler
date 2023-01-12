const urlStartRegex = /^(https*:\/\/)*/;
const russianAlphabetRegex = /[а-яА-Я]+/gm;

module.exports = {
    getRegex, urlStartRegex, russianAlphabetRegex
}
