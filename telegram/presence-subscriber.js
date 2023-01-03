const { Bot } = require('grammy');
const logger = require('../logger').child({ module: 'telegram-presence-subscriber' });

let bot = null;
if (process.env.TELEGRAM_TOKEN) {
    bot = new Bot(process.env.TELEGRAM_TOKEN);
}

function checkTitleLength(title) {
    if (title.length > 16) {
        if (title.split(' ').length > 1) {
            // abbreviate title
            const new_title = title.split(' ').reduce((acc, cur) => {
                acc += cur.pop().toUpperCase();
            }, '');
            return checkTitleLength(new_title);
        }
        else {
            //shorten title
            title = title.substring(0, 16);
            return title;
        }
    }
    return title;
}

async function setTitle(telegram_chat_id, telegram_user_id, title) {
    if (!bot) {
        return;
    }

    let safe_title = checkTitleLength(title);

    bot.api.setChatAdministratorCustomTitle(telegram_chat_id, telegram_user_id, safe_title).then(() => {
        logger.debug(
            `Set title for ${telegram_user_id} in ${telegram_chat_id} to ${safe_title}`,
            {
                telegram_chat_id,
                telegram_user_id,
                safe_title,
            }
        );
    }).catch(err => {
        logger.error(
            `Error while setting title for ${telegram_user_id} in ${telegram_chat_id} to ${safe_title}`,
            {
                error: err.stack || err,
                telegram_chat_id,
                telegram_user_id,
                safe_title,
            }
        );
    });
}

async function deleteTitle(telegram_chat_id, telegram_user_id) {
    if (!bot) {
        return;
    }

    bot.api.setChatAdministratorCustomTitle(telegram_chat_id, telegram_user_id, '').then(() => {
        logger.debug(
            `Deleted title for ${telegram_user_id} in ${telegram_chat_id}`,
            {
                telegram_chat_id,
                telegram_user_id,
            }
        );
    }).catch(err => {
        logger.error(
            `Error while deleting title for ${telegram_user_id} in ${telegram_chat_id}`,
            {
                error: err.stack || err,
                telegram_chat_id,
                telegram_user_id,
            }
        );
    });
}

module.exports = {
    setTitle,
    deleteTitle,
};