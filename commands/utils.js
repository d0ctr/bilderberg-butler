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

/**
 * 
 * @param {'prefix:key:current:next'} data
 *  @returns {{ prefix: string, key: string, current: number, next: number | string }}
 */
function parseCallbackData(data) {
    return data.split(':').reduce((acc, value, i) => {
        switch(i) {
            case 0:
                acc.prefix = value;
                break;
            case 1:
                acc.key = value;
                break;
            case 2:
                acc.current = parseInt(value);
                break
            case 3:
                acc.next = ['<', '>'].includes(value[0]) ? value : parseInt(value);
                break;
        }
        return acc;
    }, {});
}

/**
 * Generate callback data of the form `prefix:key:current:next`
 * @param {{ prefix: string?, key: string, current: number?, next: number | string }} params
 * @returns {`${params.prefix}:${params.key}:${params.current}:${params.next}`}
 */
function encodeCallbackData({ prefix, key, current = 0, next }) {
    return `${prefix}:${key}:${current}:${next}`;
}

/**
 * 
 * @param {Interaction} interaction 
 * @param {(key, start, stop) => Promise<[{[number]: {name: string}}, number]>} getChoices
 * @returns 
 */
async function listingMenuCallback(interaction, getChoices) {
    const { prefix, key, ...data} = parseCallbackData(interaction.data);
    let current = data.current;
    let next = data.next;

    let start;
    let stop;

    if (typeof next === 'number') {
        start = next;
        stop = start + 2;
        current = next;
    }
    else {
        const direction = next[0];
        start = parseInt(next.slice(1));

        if (direction === '>') {
            stop = start + 2;
        }
        else if (direction === '<') {
            start = start - 2 > 0 ? start - 2 : 0; 
            stop = start + 2;
        }
    }

    const [choices, size] = await getChoices(key, start, stop);

    if (size === 0) {
        return {
            type: 'delete_buttons',
            text: 'Эти кнопки больше не действительны',
            overrides: {
                buttons: []
            }
        }
    }
    
    let buttons = [];
    let indexes = Object.keys(choices).map(v => +v);
    
    start = indexes[0];
    stop = indexes.slice(-1)[0];

    if (start > 0) {
        buttons.push([{
            name: '⏫',
            callback: encodeCallbackData({ prefix, key, current, next: `<${start - 1}` })
        }]);
    }

    for (const i of indexes) {
        buttons.push([{
            name: `${i === current ? '☑️ ' : '' }${choices[i].name}`,
            callback: encodeCallbackData({ prefix, key, current, next: i })
        }]);
    }
    
    if (stop + 1 < size) {
        buttons.push([{
            name: `⏬`,
            callback: encodeCallbackData({ prefix, key, current, next: `>${stop + 1}` })
        }]);
    }

    if (next === current) {
        return {
            type: 'edit_text',
            text: choices[current].text,
            overrides: {
                link_preview_options: {
                    is_disabled: false,
                    show_above_text: true,
                    url: choices[current].url
                },
                buttons,
                embeded_image: choices[current].url
            }
        }
    }
    else {
        return {
            type: 'edit_buttons',
            overrides: {
                buttons
            }
        };
    }
}
   

module.exports = {
    urlStartRegex,
    russianAlphabetRegex,
    invisibleSymbol,
    getInvisibleLink,
    genKey,
    range,
    parseCallbackData,
    encodeCallbackData,
    listingMenuCallback
}

/** @typedef { (import('./telegram').TelegramInteraction | import('./discord').DiscordInteraction) & { logger: import('../logger') }} Interaction */