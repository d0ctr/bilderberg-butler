const marked = require('marked');
const { ENV } = process.env;

let origTokenizer = new marked.Tokenizer();
let tokenizer = {
    space: () => false,
	code: () => false,
	fences: () => false,
	heading: () => false,
	hr: () => false,
	blockquote: () => false,
	list: () => false,
	html: () => false,
	def: () => false,
	table: () => false,
	lheading: () => false,
	paragraph: () => false,
	text: () => false,
	escape: () => false,
	tag: () => false,
	link: () => false,
	reflink: () => false,
	emStrong: () => false,
	codespan: () => false,
	br: () => false,
	del: () => false,
	autolink: () => false,
	url: () => false,
	inlineText: () => false,
};
const allowed_entities = ['code', 'codespan', 'fences', 'blockquote', 'link', 'text', 'space', 'emStrong', 'del', 'space', 'inlineText', 'br'];
for (const key of allowed_entities) {
    tokenizer[key] = origTokenizer[key];
}
marked.use({ tokenizer });

/**
 * Utils
 * @namespace Utils
 */

/**
 * @typedef {'html' | 'markdownv2' | 'markdown'} MarkupLanguage
 * @memberof Utils
 */

/**
 * @typedef {('bold' | 'italic' | 'underline' | 'strikethrough' | 'spoiler' | 'url' | 'blockquote' | 'code' | 'pre' | 'text_link')} MLType
 * @memberof Utils
 */

const escapeHTML = (text) => text.replace(/&/gm, '&amp;').replace(/>/gm, '&gt;').replace(/</gm, '&lt;');
const escapeMDV2 = (text) => text.replace(/(_|\*|\[|\]|\(|\)|~|`|>|#|\+|-|=|\||\{|\}|\.|!)/gm, '\\$1');
const escapeMD = (text) => text.replace(/(_|`|\*|\[])/gm, '\\$1');

/**
 * Marks up text with the specified langugae attributes
 * @function MLConvertFunction
 * @param {string} text
 * @param {Utils.MarkupLanguage} type
 * @param {object} other
 * @memberof Utils
 */
() => {}

/**
 * @type {object}
 * @property {Utils.MLConvertFunction} bold
 * @property {Utils.MLConvertFunction} italic
 * @property {Utils.MLConvertFunction} underline
 * @property {Utils.MLConvertFunction} strikethrough
 * @property {Utils.MLConvertFunction} spoiler
 * @property {Utils.MLConvertFunction} url
 * @property {Utils.MLConvertFunction} blockquote
 * @property {Utils.MLConvertFunction} code
 * @property {Utils.MLConvertFunction} pre
 * @property {Utils.MLConvertFunction} text_link
 * @memberof Utils
 */
exports.to = {
    'bold': (text, type) => type == 'html' ? `<b>${escapeHTML(text)}</b>` : `*${escapeMD(text)}*`,
    'italic': (text, type) => type == 'html' ? `<i>${escapeHTML(text)}</i>` : `_${escapeMD(text)}_`,
    'underline': (text, type) => type == 'html' ? `<u>${escapeHTML(text)}</u>` : `__${escapeMD(text)}__`,
    'strikethrough': (text, type) => type == 'html' ? `<s>${escapeHTML(text)}</s>` : `~${escapeMD(text)}~`,
    'spoiler': (text, type) => type == 'html' ? `<span class="tg-spoiler">${escapeHTML(text)}</span>` : `||${escapeMD(text)}||`,
    'url': (text, type, { url }) => type == 'html' ? `<a href="${url}">${escapeHTML(text)}</a>` : `[${escapeMD(text)}](${url})`,
    'blockquote': (text, type) => type == 'html' ? `<blockquote>${escapeHTML(text)}</blockquote>` : `>${escapeMD(text).split('\n').join('\n>')}\n`,
    'code': (text, type) => type == 'html' ? `<code>${text}</code>` : `\`${text}\``,
    'pre': (text, type, { language }) => type == 'html' ? `<pre><code${language ? ` class="${language}"` : ''}>${text}</code></pre>` : `\`\`\`${language || ''}\n${text}\`\`\`\n`,
}
exports.to['text_link'] = exports.to['url'];

exports.escapeMD = escapeMD;
exports.escapeHTML = escapeHTML;
exports.convertMD2HTML = (text) => {
    return marked
		.parse(text, { tokenizer })
		.replaceAll('<p>', '')
		.replaceAll('</p>', '\n')
		.replaceAll('</br>', '\n')
		.replaceAll('</pre>', '</pre>\n')
		.replaceAll('\n</', '</');
};

exports.icons = {
	'discord'          : '<tg-emoji emoji-id="5190555740577746802">☎️</tg-emoji>',
	'sound_on'         : '<tg-emoji emoji-id="5190573203914771019">🎧</tg-emoji>',
	'sound_off'        : '<tg-emoji emoji-id="5192789553068395493">🔕</tg-emoji>',
	'mic_on'           : '<tg-emoji emoji-id="5193192064518474546">🎤</tg-emoji>',
	'mic_off'          : '<tg-emoji emoji-id="5190522484645971930">🔇</tg-emoji>',
	'activity'         : '<tg-emoji emoji-id="5190590349424217698">🚀</tg-emoji>',
	'live'             : '<tg-emoji emoji-id="5190704475295205942">🔴</tg-emoji>',
	'share_screen'     : '<tg-emoji emoji-id="5192980683408033875">📺</tg-emoji>',
	'video_on'         : '<tg-emoji emoji-id="5190682042681018715">🎥</tg-emoji>',
	'voice_channel'    : '<tg-emoji emoji-id="5192801849559762029">🔈</tg-emoji>',
	'announcements'    : '<tg-emoji emoji-id="5190777683012765089">📣</tg-emoji>',
	'checkbox'         : '<tg-emoji emoji-id="5192904237285132899">🔳</tg-emoji>',
	'checkbox_checked' : '<tg-emoji emoji-id="5193020678143494129">☑️</tg-emoji>',
	'boost'            : '<tg-emoji emoji-id="5190845066754671008">⚡️</tg-emoji>',
	'event'            : '<tg-emoji emoji-id="5193183551893292832">🗓</tg-emoji>',
	'forum_channel'    : '<tg-emoji emoji-id="5190455049364458822">🏛</tg-emoji>',
	'notifications'    : '<tg-emoji emoji-id="5193028125616784390">🔔</tg-emoji>',
	'notifications_off': '<tg-emoji emoji-id="5193089685383039049">🔕</tg-emoji>',
	'rules'            : '<tg-emoji emoji-id="5192873420894782452">📕</tg-emoji>',
	'settings'         : '<tg-emoji emoji-id="5190508586131803488">⚙️</tg-emoji>',
	'stage_channel'    : '<tg-emoji emoji-id="5192839361804126766">🎤</tg-emoji>',
	'text_channel'     : '<tg-emoji emoji-id="5190816367783201595">📝</tg-emoji>',
};

if (ENV === 'dev') {
	for (const key in exports.icons) {
		exports.icons[key] = exports.icons[key].split('</tg-emoji>')[0].split('>')[1];
	}
}

exports.wideSpace = ' ';