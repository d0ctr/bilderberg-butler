/**
 * Common Interface
 * @namespace Common
 */

/**
 * @typedef {object} CommandArg
 * @property {string} name Argument name 
 * @property {'string'} type Argument type (currently only string)
 * @property {string} description Argument description
 * @property {boolean} optional `true` if argument is not necessary
 * @memberof Common
*/

/**
 * @typedef {object} CommandDefinition Common command definition
 * @property {string} command_name Command name
 * @property {Common.CommandArg[]} args {@link CommandArg|List of arguments acceptable by command}
 * @property {number} limit Argument limit {@link Common.Telegram.commonizeContext}
 * @property {boolean} is_inline `true` if command should be available as an inline command
 * @property {string} description Command description
 * @memberof Common
 */

/**
 * Handles command call
 * @function CommandHandler
 * @async
 * @param {Common.DiscordInteraction | Common.TelegramInteraction} interaction Command interaction
 * @memberof Common
 */
() => {}