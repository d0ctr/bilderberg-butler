const GrammyTypes = require('grammy');

/**
 * `/fizzbuzz` command handler
 * @param {GrammyTypes.Context | Object} input
 * @returns {[String | null, String | null]}
 */

async function fizzbuzz(input) {
    let args = this._parseArgs(input).slice(1);
    let dict = {};
    if (!args.length || args.length % 2 !== 0) {
        return ['Аргументы команды должны представлять из себя последовательность из комбинаций <code>число</code> <code>слово</code>'];
    }
    for (let i = 0; i < args.length; i += 2) {
        if (isNaN(Number(i))) {
            return [`<code>${i}</code> это не число, попробуй ещё раз`];
        }
        dict[args[i]] = args[i + 1];
    }
    let answer = '';
    for (let i = 1; i < 101; i++) {
        let result = '';
        for (let key in dict) {
            if (i % Number(key) === 0) {
                result += dict[key];
            }
        }
        if (result === '') {
            result = i;
        }
        answer += `${result}\n`
    }
    answer = answer.trim();
    return [null, answer];
}

module.exports = {
    fizzbuzz,
}
