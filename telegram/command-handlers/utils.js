/**
* Parse command line
* @param {GrammyTypes.Context | Object} input
* @param {Integer} limit number of parsable args
* @return {Array<String>} [0] is always a command name
*/
exports.parseArgs = (input, limit) => {
    let args = [];
    // split all words by <space>
    args = input.message.text.replace(/ +/g, ' ').split(' ');
    // remove `/` from the name of the command
    args[0] = args[0].split('').slice(1).join('');
    // concat args to single arg
    if (limit && (limit + 1) < args.length && limit > 0) {
        args[limit] = args.slice(limit).join(' ');
        args = args.slice(0, limit + 1);
    }
    return args;
}