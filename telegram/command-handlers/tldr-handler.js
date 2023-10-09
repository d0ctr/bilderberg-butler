const { JSDOM } = require('jsdom');

const { InlineKeyboard } = require('grammy');

const { YA300_API_BASE } = require('../../config.json');

async function getSummaryURL({ article_url }) {
    return await fetch(
        `${YA300_API_BASE}`,
        {
            method: 'post',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `OAuth ${process.env.YA300_TOKEN}`
            },
            body: JSON.stringify({ article_url })
        }
    );
}

async function getSummaryHTML(url) {
    return await fetch(url);
}

async function parseSummary(response) {
    const html = await response.text();
    const result = {};
    const $ = require('jquery')((new JSDOM(html)).window);
    const summaryDiv = $('.summary .summary-content .summary-text');

    result.title = summaryDiv.find('.title').text()?.trim();
    result.summary = summaryDiv.find('li.thesis a').get()?.map(thesis => {
        return { text: thesis.text?.trim(), url: thesis.href };
    });
    result.sharing_url = response.url;

    return result;
}

exports.definition = {
    command_name: 'tldr',
    args: [
        {
            name: 'url',
            type: 'string',
            description: 'Ссылка на статью.',
            optional: false
        }
    ],
    is_inline: true,
    description: 'Возвращает краткий персказ сгенерированный YandexGPT'
};

exports.condition = !!process.env.YA300_API_BASE;

async function handler(input, interaction) {
    const text = require('./utils').parseArgs(input)[1] || input.message?.reply_to_message?.text || input.message?.reply_to_message?.caption || '';

    const article_url = text.split(' ').find(words => words.match(/https?:\/\//));

    if (!article_url) {
        return ['Для запроса нужно предоставить ссылку, например https://habr.com/ru/news/729422/'];
    }

    return getSummaryURL({ article_url })
        .then(response => response.json())
        .catch(err => { throw { why: 'badresponse', error: err } })
        .then(({ status, sharing_url }) => {
            interaction.logger.silly(`Received response from Ya300`);
            if (status !== 'success') throw { message: `API responded with status=${status}`, why: 'badstatus' };
            return getSummaryHTML(sharing_url);
        })
        .catch(err => { throw { why: err.why || 'badresponse', error: err.error || err } })
        .then(response => parseSummary(response))
        .then(({ title, summary, sharing_url }) => {
            interaction.logger.silly(`Parsed summary from Ya300`);
            if (!summary) throw { message: 'No title/summary in response', why: 'badparsing' };
            return [
                null,
                `<b>${title}</b>\n${summary.reduce((acc, thesis) => acc += `${thesis.text}<a href="${thesis.url}">🔗</a>\n`, '')}`,
                null,
                { reply_markup: new InlineKeyboard().url('Посмотреть на сайте', sharing_url)}
            ];
        })
        .catch(err => {
            interaction.logger.error(err.message || err.error?.message || 'Error', { error: err.stack || err, args: [text, article_url] });
            switch (err?.why) {
                case 'badparsing':
                    return ['Боту чего-то поплохело, давай на ту ссылку больше не ходить'];
                case 'badstatus':
                    return ['Яндекс просил передать, что там ничего хорошего нет'];
                case 'badresponse':
                    return ['Яндексу поплохело, можешь попробовать позже'];
                default:
                    return [`Что-то совсем не так:\n<code>${err.message}</code>`]
            }
        });
}

exports.tldr = handler;