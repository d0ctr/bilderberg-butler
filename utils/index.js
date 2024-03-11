const marked = require('marked');

let origTokenizer = new marked.Tokenizer();
let tokenizer = {
    space: (text) => false,
	code: (text) => false,
	fences: (text) => false,
	heading: (text) => false,
	hr: (text) => false,
	blockquote: (text) => false,
	list: (text) => false,
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