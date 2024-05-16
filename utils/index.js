const marked = require('marked');
const { ENV } = process.env;


const origTokenizer = new marked.Tokenizer();
const noTokenizer = {
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
const html_allowed_entities = ['code', 'codespan', 'fences', 'blockquote', 'link', 'text', 'emStrong', 'space', 'inlineText', 'br'];
const node_allowed_entities = ['link', 'heading', 'list', 'em', 'blockquote', 'space', 'fences', 'code', 'codespan', 'em', 'text', 'emStrong', 'del', 'inlineText', 'br'];

let tgTokenizer = { ...noTokenizer };
for (const key of html_allowed_entities) {
	tgTokenizer[key] = origTokenizer[key];
}
let nodeTokenizer = { ...noTokenizer };
for (const key of node_allowed_entities) {
	nodeTokenizer[key] = origTokenizer[key];
}

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
		.parse(text, { tokenizer: tgTokenizer })
		.replaceAll('<p>', '')
		.replaceAll('</p>', '\n')
		.replaceAll('</br>', '\n')
		.replaceAll('</pre>', '</pre>\n')
		.replaceAll('\n</', '</');
};

exports.icons = {
	'discord'          : '<tg-emoji emoji-id="5253551254268822788">☎️</tg-emoji>',
	'sound_on'         : '<tg-emoji emoji-id="5253715880365278849">🎧</tg-emoji>',
	'sound_off'        : '<tg-emoji emoji-id="5253991574316008987">🔕</tg-emoji>',
	'mic_on'           : '<tg-emoji emoji-id="5253634185792340698">🎤</tg-emoji>',
	'mic_off'          : '<tg-emoji emoji-id="5253807083995810190">🔇</tg-emoji>',
	'activity'         : '<tg-emoji emoji-id="5253645159433783493">🚀</tg-emoji>',
	'live'             : '<tg-emoji emoji-id="5253960556062196348">🔴</tg-emoji>',
	'share_screen'     : '<tg-emoji emoji-id="5253810764782783059">📺</tg-emoji>',
	'video_on'         : '<tg-emoji emoji-id="5253543931349583986">🎥</tg-emoji>',
	'voice_channel'    : '<tg-emoji emoji-id="5253930581485439136">🔈</tg-emoji>',
	'announcements'    : '<tg-emoji emoji-id="5253756914482825143">📣</tg-emoji>',
	'checkbox'         : '<tg-emoji emoji-id="5253813573691394742">🔳</tg-emoji>',
	'checkbox_checked' : '<tg-emoji emoji-id="5253662893353748779">☑️</tg-emoji>',
	'boost'            : '<tg-emoji emoji-id="5253904369300031313">⚡️</tg-emoji>',
	'event'            : '<tg-emoji emoji-id="5253584110768637850">🗓</tg-emoji>',
	'forum_channel'    : '<tg-emoji emoji-id="5253869751863626107">🏛</tg-emoji>',
	'notifications'    : '<tg-emoji emoji-id="5253865663054761637">🔔</tg-emoji>',
	'notifications_off': '<tg-emoji emoji-id="5253558001662444808">🔕</tg-emoji>',
	'rules'            : '<tg-emoji emoji-id="5253803995914323587">📕</tg-emoji>',
	'settings'         : '<tg-emoji emoji-id="5253847121680942581">⚙️</tg-emoji>',
	'stage_channel'    : '<tg-emoji emoji-id="5253994817016318216">🎤</tg-emoji>',
	'text_channel'     : '<tg-emoji emoji-id="5253959516680113643">📝</tg-emoji>',
	'folder'           : '<tg-emoji emoji-id="5253664576980929234">📂</tg-emoji>',
	'lock'             : '<tg-emoji emoji-id="5253456387031189167">🔒</tg-emoji>',
};

if (ENV === 'dev') {
	for (const key in exports.icons) {
		exports.icons[key] = exports.icons[key].split('</tg-emoji>')[0].split('>')[1];
	}
}

exports.wideSpace = ' ';

const unescape = (text) => {
	const escapeReplacements = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;'
	};

	for (const [original, escape] of Object.entries(escapeReplacements)) {
		text = text.replace(escape, original);
	}

	return text;
}

const token2Node = (token) => {
	let children = token.tokens?.map(t => token2Node(t)) || [token.text];

	switch (token.type) {
		case 'text':
			if (!token.tokens || (token.tokens.length == 1 && token.tokens[0].type === 'text')) return unescape(token.text);
			return { tag: 'p', children };
		case 'heading':
			return { tag: token.depth <= 3 ? 'h3' : 'h4', children };
		case 'br':
			return { tag: 'br' };
		case 'space':
			return '';
		case 'code':
			return { tag: 'pre', children };
		case 'codespan':
			return { tag: 'code', children };
		case 'strong':
		case 'em':
		case 'blockquote':
			return { tag: token.type, children };
		case 'link':
			return { tag: 'a', children, attrs: { href: token.href } };
		case 'list':
			if (token.ordered) {
				return {
					tag: 'ol',
					children: token.items.map(t => token2Node(t))
				};
			}
			else {
				return {
					tag: 'ul',
					children: token.items.map(t => token2Node(t))
				};
			}
		case 'list_item':
			return { tag: 'li', children };
		default:
			return token;
	}
}

exports.convertMD2Nodes = (text) => {
	return marked.lexer(text, { tokenizer: nodeTokenizer }).map(t => token2Node(t));
};