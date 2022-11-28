const mathjs = require("mathjs");
const GrammyTypes = require('grammy');

/**
 * `/calc` command handler
 * @param {GrammyTypes.Context | Object} input
 * @returns {[String | null, String | null, String | null]} [err, response, short_response]
 */

async function calc(input) {
    let math_line = this._parseArgs(input, 1)[1];
    if (!math_line) {
        return ['Напиши хоть что-нибудь, типа: 1+1'];
    }
    let result = null;
    try {
        result = `${math_line} = ${mathjs.evaluate(math_line).toLocaleString({ nu: 'arab' })}`;
    }
    catch (err) {
        this.logger.error(`Error while calculating: ${err.stack || err}`, { args: [math_line], error: err.stack || err });
        return ['Что-то ты не то написал, этой командой можно считать только математические выражения'];
    }
    return [null, result, mathjs.evaluate(math_line).toString()];
}

module.exports = {
    calc,
}
