// mdsprint: a speed-focused, single-module fork of marked 18.1.3 (https://github.com/markedjs/marked).
// marked is MIT licensed: Copyright (c) 2018+, MarkedJS; Copyright (c) 2011-2018, Christopher Jeffrey.
// This module reproduces marked.parse(markdown) with marked's default options (gfm: true, breaks: false,
// pedantic: false, async: false) byte for byte. The extension, hook, async and option machinery that the
// default path never uses has been removed; the Tokenizer is merged into the Lexer and the Renderer is a
// set of plain functions. See LICENSE.

// ---------------------------------------------------------------------------------------------------
// Regex construction helper (same splicing semantics as marked's edit(): carets in inserted parts are
// dropped unless they open a character class).
const CARET = /(^|[^\[])\^/g;
function edit(re, flags = '') {
  let src = typeof re === 'string' ? re : re.source;
  const api = {
    replace(name, val) {
      let v = typeof val === 'string' ? val : val.source;
      v = v.replace(CARET, '$1');
      src = src.replace(name, v);
      return api;
    },
    getRegex() {
      return new RegExp(src, flags);
    },
  };
  return api;
}

// ---------------------------------------------------------------------------------------------------
// "other" helper regexes
const reCodeRemoveIndent = /^(?: {0,3}\t| {1,4})/gm;
const reOutputLinkReplace = /\\([\[\]])/g;
const reIndentCodeCompensation = /^(\s+)(?:```)/;
const reBeginningSpace = /^\s+/;
const reEndingHash = /#$/;
const reStartingSpaceChar = /^ /;
const reEndingSpaceChar = / $/;
const reEndingSpaceTabChar = /[ \t]$/;
const reNonSpaceChar = /[^ ]/;
const reNewLineCharGlobal = /\n/g;
const reTabCharGlobal = /\t/g;
const reLeadingSpaceTab = /^[ \t]+/;
const reMultipleSpaceGlobal = /\s+/g;
const reBlankLine = /^[ \t]*$/;
const reDoubleBlankLine = /\n[ \t]*\n[ \t]*$/;
const reBlockquoteStart = /^ {0,3}>/;
const reBlockquoteSetextReplace = /\n {0,3}((?:=+|-+)[ \t]*)(?=\n|$)/g;
const reBlockquoteSetextReplace2 = /^ {0,3}>[ \t]?/gm;
const reBlockquoteMarkerWhitespace = /^( {0,3}>)([ \t]+)/gm;
const reListIsTask = /^\[[ xX]\][ \t]+\S/;
const reListReplaceTask = /^\[[ xX]\][ \t]+/;
const reListTaskCheckbox = /\[[ xX]\]/;
const reAnyLine = /\n.*\n/;
const reHrefBrackets = /^<(.*)>$/;
const reTableDelimiter = /[:|]/;
const reTableAlignChars = /^\||\| *$/g;
const reTableRowBlankLine = /\n[ \t]*$/;
const reTableAlignRight = /^ *-+: *$/;
const reTableAlignCenter = /^ *:-+: *$/;
const reTableAlignLeft = /^ *:-+ *$/;
const reStartATag = /^<a /i;
const reEndATag = /^<\/a>/i;
const reStartPreScriptTag = /^<(pre|code|kbd|script)(\s|>)/i;
const reEndPreScriptTag = /^<\/(pre|code|kbd|script)(\s|>)/i;
const reStartAngleBracket = /^</;
const reEndAngleBracket = />$/;
const reUnicodeAlphaNumeric = /[\p{L}\p{N}]/u;
const reNumericCharRef = /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/;
const reNumericCharRefOrAmp = /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g;
const reEscapeTest = /[&<>"']/;
const reEscapeReplace = /[&<>"']/g;
const reEscapeTestNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
const reEscapeReplaceNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g;
const rePercentDecode = /%25/g;
const reFindPipe = /\|/g;
const reSplitPipe = / \|/;
const reSlashPipe = /\\\|/g;
const reCarriageReturn = /\r\n|\r/g;
const reNotSpaceStart = /^\S*/;
const reEndingNewline = /\n$/;
const reSetextUnderline = /^ {0,3}(?:=+|-+) *$/;
const reUpTo3Spaces = /^ {0,3}/;
const reLeadingNewline = /^\n/;
const reBacktickGlobal = /`/g;

const BLOCK_TAGS = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';

// Per-indent regex caches for list items (indent is clamped to 0..3 like marked does).
function perIndent(make) {
  const cache = [];
  return (indent) => {
    const n = Math.max(0, Math.min(3, indent - 1));
    let re = cache[n];
    if (!re) {
      re = make(n);
      cache[n] = re;
    }
    return re;
  };
}
const listItemRegexCache = new Map();
function listItemRegex(bull) {
  let re = listItemRegexCache.get(bull);
  if (!re) {
    re = new RegExp(`^( {0,3}${bull})((?:[\t ][^\\n]*)?(?:\\n|$))`);
    listItemRegexCache.set(bull, re);
  }
  return re;
}
const nextBulletRegex = perIndent((n) => new RegExp(`^ {0,${n}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`));
const hrRegex = perIndent((n) => new RegExp(`^ {0,${n}}((?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\\*[ \t]*){3,})(?:\\n+|$)`));
const fencesBeginRegex = perIndent((n) => new RegExp(`^ {0,${n}}(?:\`\`\`|~~~)`));
const headingBeginRegex = perIndent((n) => new RegExp(`^ {0,${n}}#{1,6}(?:\\s|$)`));
const htmlBeginRegex = perIndent((n) => new RegExp(`^ {0,${n}}(?:</?(?:${BLOCK_TAGS})(?: +|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`, 'i'));
const blockquoteBeginRegex = perIndent((n) => new RegExp(`^ {0,${n}}>`));

// ---------------------------------------------------------------------------------------------------
// Block grammar (GFM variant)
const bNewline = /^(?:[ \t]*(?:\n|$))+/;
const bCode = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
const bFences = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}(?:(?=`)\1`*|(?=~)\1~*) *(?=\n|$)|$)/;
const bHr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
const bHeading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
const bBullet = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
const lheadingBase = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |fences|blockquote|heading|hr|html|table))+?)\n {0,3}(=+|-+)[ \t]*(?:\n+|$)/;
const bLheading = edit(lheadingBase)
  .replace(/bull/g, bBullet)
  .replace(/blockCode/g, /(?: {4}| {0,3}\t)/)
  .replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/)
  .replace(/blockquote/g, / {0,3}>/)
  .replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/)
  .replace(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/)
  .replace(/html/g, / {0,3}<[^\n>]+>\n/)
  .replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/)
  .getRegex();
const paragraphBase = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/;
const bText = /^[^\n]+/;
const refLabel = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\\n]|\n(?![ \t]*\n))+/;
const bDef = edit(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/)
  .replace('label', refLabel)
  .replace('title', /(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\\n]|\n(?!\n))*'|\((?:\\[\s\S]|[^()\\])*\))/)
  .getRegex();
const bList = edit(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g, bBullet).getRegex();
const htmlComment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
const bHtml = edit('^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?:[ \\t]+|\\n|/?>|$)[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|</[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$))', 'i')
  .replace('comment', htmlComment)
  .replace('tag', BLOCK_TAGS)
  .replace('attribute', / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/)
  .getRegex();
const HTML_START = ' {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)';
const FENCE_START = ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)';
const HEADING_START = ' {0,3}#{1,6}(?:\\s|$)';
const blockquoteParagraph = edit(paragraphBase)
  .replace('hr', bHr)
  .replace('heading', HEADING_START)
  .replace('|lheading', '')
  .replace('|table', '')
  .replace('blockquote', ' {0,3}>')
  .replace('fences', FENCE_START)
  .replace('list', / {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/)
  .replace('html', HTML_START)
  .replace('tag', BLOCK_TAGS)
  .getRegex();
const bBlockquote = edit(/^( {0,3}> ?(?:(?![ \t]*(?:\n|$))(paragraph)|[^\n]*)(?:\n|$))+/)
  .replace('paragraph', blockquoteParagraph)
  .getRegex();
const bTable = edit('^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)')
  .replace('hr', bHr)
  .replace('heading', HEADING_START)
  .replace('blockquote', ' {0,3}>')
  .replace('code', '(?: {4}| {0,3}\t)[^\\n]')
  .replace('fences', FENCE_START)
  .replace('list', ' {0,3}(?:[*+-]|1[.)])[ \\t]')
  .replace('html', HTML_START)
  .replace('tag', BLOCK_TAGS)
  .getRegex();
const bParagraph = edit(paragraphBase)
  .replace('hr', bHr)
  .replace('heading', HEADING_START)
  .replace('|lheading', '')
  .replace('table', bTable)
  .replace('blockquote', ' {0,3}>')
  .replace('fences', FENCE_START)
  .replace('list', ' {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]')
  .replace('html', HTML_START)
  .replace('tag', BLOCK_TAGS)
  .getRegex();

// ---------------------------------------------------------------------------------------------------
// Inline grammar (GFM variant)
const iEscape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
const iCode = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
const iBr = /^( {2,}|\\)\n(?!\s*$)[ \t]*/;
const PUNCT = /[\p{P}\p{S}]/u;
const PUNCT_SPACE = /[\s\p{P}\p{S}]/u;
const NOT_PUNCT_SPACE = /[^\s\p{P}\p{S}]/u;
const iPunctuation = edit(/^((?![*_])punctSpace)/, 'u').replace(/punctSpace/g, PUNCT_SPACE).getRegex();
const PUNCT_GFM = /(?!~)[\p{P}\p{S}]/u;
const PUNCT_SPACE_GFM = /(?!~)[\s\p{P}\p{S}]/u;
const NOT_PUNCT_SPACE_GFM = /(?:[^\s\p{P}\p{S}]|~)/u;
const iBlockSkip = edit(/link|precode-code|html/, 'g')
  .replace('link', /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/)
  .replace('precode-', '(?<!`)()')
  .replace('code', /(?<b>`+)[^`]+\k<b>(?!`)/)
  .replace('html', /<(?! )[^<>]*?>/)
  .getRegex();
const iEmStrongLDelim = edit(/^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/, 'u')
  .replace(/punct/g, PUNCT_GFM)
  .getRegex();
const iEmStrongRDelimAst = edit('^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)', 'gu')
  .replace(/notPunctSpace/g, NOT_PUNCT_SPACE_GFM)
  .replace(/punctSpace/g, PUNCT_SPACE_GFM)
  .replace(/punct/g, PUNCT_GFM)
  .getRegex();
const iEmStrongRDelimUnd = edit('^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)', 'gu')
  .replace(/notPunctSpace/g, NOT_PUNCT_SPACE)
  .replace(/punctSpace/g, PUNCT_SPACE)
  .replace(/punct/g, PUNCT)
  .getRegex();
const iDelLDelim = edit(/^~~?(?:((?!~)punct)|[^\s~])/, 'u').replace(/punct/g, PUNCT).getRegex();
const iDelRDelim = edit('^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)', 'gu')
  .replace(/notPunctSpace/g, NOT_PUNCT_SPACE)
  .replace(/punctSpace/g, PUNCT_SPACE)
  .replace(/punct/g, PUNCT)
  .getRegex();
const iAnyPunctuation = edit(/\\(punct)/, 'gu').replace(/punct/g, PUNCT).getRegex();
const iAnyPunctuationOutsideCode = edit(/(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\(punct)/, 'gu').replace(/punct/g, PUNCT).getRegex();
const iAutolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/)
  .replace('scheme', /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/)
  .replace('email', /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/)
  .getRegex();
const closedComment = edit(htmlComment).replace('(?:-->|$)', '-->').getRegex();
const iTag = edit('^comment|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>')
  .replace('comment', closedComment)
  .replace('attribute', /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/)
  .getRegex();
const linkBrackets = /\[(?:\\[\s\S]|[^\[\]\\])*\]/;
const linkLabel = edit(/(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/)
  .replace('brackets', linkBrackets)
  .getRegex();
const iLink = edit(/^!?\[(label)\]\([ \t\n]*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?[ \t\n]*\)/)
  .replace('label', linkLabel)
  .replace('href', /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/)
  .replace('title', /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^)\\])*\)/)
  .getRegex();
const iReflink = edit(/^!?\[(label)\]\[(ref)\]/).replace('label', linkLabel).replace('ref', refLabel).getRegex();
const iNolink = edit(/^!?\[(ref)\](?:\[\])?/).replace('ref', refLabel).getRegex();
const searchRef = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/;
const searchLabel = edit(/(?:[^\[\]\\`]*(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/)
  .replace('brackets', linkBrackets)
  .getRegex();
const iReflinkSearch = edit('reflink|nolink(?!\\()', 'g')
  .replace('reflink', edit(/^!?\[(label)\]\[(ref)\]/).replace('label', searchLabel).replace('ref', searchRef).getRegex())
  .replace('nolink', edit(/^!?\[(ref)\](?:\[\])?/).replace('ref', searchRef).getRegex())
  .getRegex();
const urlProtocol = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
const urlEmail = /[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/;
const emailProtocol = edit(/(?:mailto:email|xmpp:email(?:\/[A-Za-z0-9@.]+)?)/).replace(/email/g, urlEmail).getRegex();
const iUrl = edit(/^emailProtocol|^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/)
  .replace('emailProtocol', emailProtocol)
  .replace('protocol', urlProtocol)
  .replace('email', /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/)
  .getRegex();
const iBackpedal = /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/;
const iText = edit(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|wwwStart|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/)
  .replace('protocol', urlProtocol)
  .replace(/emailProtocol/g, /(?:mailto|xmpp):/)
  .replace('wwwStart', '(?<![^\\s*_~(])www\\.')
  .getRegex();

// ---------------------------------------------------------------------------------------------------
// Helpers
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeChar = (ch) => ESCAPES[ch];
function escapeHtml(html, encode) {
  if (encode) {
    if (reEscapeTest.test(html)) return html.replace(reEscapeReplace, escapeChar);
  } else if (reEscapeTestNoEncode.test(html)) {
    return html.replace(reEscapeReplaceNoEncode, escapeChar);
  }
  return html;
}

function decodeNumericRefs(text) {
  if (!reNumericCharRef.test(text)) return text;
  return text.replace(reNumericCharRefOrAmp, (m, dec, hex) => {
    if (dec === undefined && hex === undefined) return '&amp;';
    const cp = dec === undefined ? Number.parseInt(hex, 16) : Number.parseInt(dec, 10);
    if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '\uFFFD';
    if (cp === 38) return '&amp;';
    return String.fromCodePoint(cp);
  });
}

function cleanUrl(href) {
  try {
    return encodeURI(href).replace(rePercentDecode, '%');
  } catch {
    return null;
  }
}

function splitCells(tableRow, count) {
  const row = tableRow.replace(reFindPipe, (m, offset, str) => {
    let escaped = false;
    let cur = offset;
    while (--cur >= 0 && str[cur] === '\\') escaped = !escaped;
    return escaped ? '|' : ' |';
  });
  const cells = row.split(reSplitPipe);
  if (!cells[0].trim()) cells.shift();
  if (cells.length > 0 && !cells[cells.length - 1]?.trim()) cells.pop();
  if (count) {
    if (cells.length > count) cells.splice(count);
    else while (cells.length < count) cells.push('');
  }
  for (let i = 0; i < cells.length; i++) cells[i] = cells[i].trim().replace(reSlashPipe, '|');
  return cells;
}

// Remove trailing `c` characters (or, with invert, trailing non-`c` characters).
function rtrim(str, c, invert) {
  const l = str.length;
  if (l === 0) return '';
  let suff = 0;
  while (suff < l) {
    const ch = str.charAt(l - suff - 1);
    if (ch === c && !invert) suff++;
    else if (ch !== c && invert) suff++;
    else break;
  }
  return str.slice(0, l - suff);
}

function trimTrailingBlankLines(str) {
  const lines = str.split('\n');
  let i = lines.length - 1;
  while (i >= 0 && reBlankLine.test(lines[i])) i--;
  if (lines.length - i <= 2) return str;
  return lines.slice(0, i + 1).join('\n');
}

function normalizeLabel(label) {
  return label.trim().replace(reMultipleSpaceGlobal, ' ').toLowerCase().toUpperCase().toLowerCase();
}

function findClosingBracket(str, b) {
  if (str.indexOf(b[0]) === -1 && str.indexOf(b[1]) === -1) return -1;
  let level = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\') i++;
    else if (str[i] === b[0]) level++;
    else if (str[i] === b[1]) {
      level--;
      if (level < 0) return i;
    }
  }
  return level > 0 ? -2 : -1;
}

// Last index (per delimiter) where a run of * / _ / ~ could close: a run not preceded by whitespace.
function closerInfo(src) {
  let star = -1;
  let under = -1;
  let tilde = -1;
  const n = src.length;
  for (let i = 0; i < n; i++) {
    const ch = src[i];
    if (ch !== '*' && ch !== '_' && ch !== '~') continue;
    const prev = i === 0 ? '\n' : src[i - 1];
    let j = i + 1;
    while (j < n && src[j] === ch) j++;
    if (prev !== ' ' && prev !== '\t' && prev !== '\n' && prev !== '\r' && prev !== '\f') {
      if (ch === '~') tilde = i;
      else if (ch === '*') star = i;
      else under = i;
    }
    i = j - 1;
  }
  return { masked: src, star, under, tilde };
}

function expandTabs(text, col = 0) {
  let c = col;
  let out = '';
  for (const ch of text) {
    if (ch === '\t') {
      const w = 4 - (c % 4);
      out += ' '.repeat(w);
      c += w;
    } else {
      out += ch;
      c++;
    }
  }
  return out;
}

function indentCodeCompensation(raw, text) {
  const m = raw.match(reIndentCodeCompensation);
  if (m === null) return text;
  const indent = m[1];
  return text
    .split('\n')
    .map((line) => {
      const ws = line.match(reBeginningSpace);
      if (ws === null) return line;
      const [lead] = ws;
      return line.slice(Math.min(lead.length, indent.length));
    })
    .join('\n');
}

// ---------------------------------------------------------------------------------------------------
// Lexer (block + inline tokenizers merged)
class Lexer {
  constructor() {
    this.tokens = [];
    this.links = Object.create(null);
    this.inlineQueue = [];
    this.inLink = false;
    this.inRawBlock = false;
    this.linkEmitted = false;
    this.linkParenPossible = true;
    this.top = true;
    this.closers = [];
  }

  lex(src) {
    src = src.replace(reCarriageReturn, '\n');
    this.blockTokens(src, this.tokens);
    const q = this.inlineQueue;
    for (let i = 0; i < q.length; i++) {
      const item = q[i];
      this.inRawBlock = false;
      this.inlineTokens(item.src, item.tokens);
    }
    this.inlineQueue = [];
    return this.tokens;
  }

  inline(src, tokens = []) {
    this.inlineQueue.push({ src, tokens });
    return tokens;
  }

  blockTokens(src, tokens = [], lastParagraphClipped = false) {
    let minLen = Infinity;
    while (src) {
      if (src.length < minLen) minLen = src.length;
      else throw new Error('Infinite loop on byte: ' + src.charCodeAt(0));
      let tok;
      let last;

      if ((tok = this.space(src))) {
        src = src.substring(tok.raw.length);
        last = tokens[tokens.length - 1];
        if (tok.raw.length === 1 && last !== undefined) last.raw += '\n';
        else tokens.push(tok);
        continue;
      }
      if ((tok = this.code(src))) {
        src = src.substring(tok.raw.length);
        last = tokens[tokens.length - 1];
        if (last?.type === 'paragraph' || last?.type === 'text') {
          last.raw += (last.raw.endsWith('\n') ? '' : '\n') + tok.raw;
          last.text += '\n' + tok.text;
          this.inlineQueue[this.inlineQueue.length - 1].src = last.text;
        } else tokens.push(tok);
        continue;
      }
      if ((tok = this.fences(src)) || (tok = this.heading(src)) || (tok = this.hr(src)) ||
          (tok = this.blockquote(src)) || (tok = this.list(src)) || (tok = this.html(src))) {
        src = src.substring(tok.raw.length);
        tokens.push(tok);
        continue;
      }
      if ((tok = this.def(src))) {
        src = src.substring(tok.raw.length);
        last = tokens[tokens.length - 1];
        if (last?.type === 'paragraph' || last?.type === 'text') {
          last.raw += (last.raw.endsWith('\n') ? '' : '\n') + tok.raw;
          last.text += '\n' + tok.raw;
          this.inlineQueue[this.inlineQueue.length - 1].src = last.text;
        } else {
          if (!this.links[tok.tag]) this.links[tok.tag] = { href: tok.href, title: tok.title };
          tokens.push(tok);
        }
        continue;
      }
      if ((tok = this.table(src)) || (tok = this.lheading(src))) {
        src = src.substring(tok.raw.length);
        tokens.push(tok);
        continue;
      }
      if (this.top && (tok = this.paragraph(src))) {
        last = tokens[tokens.length - 1];
        if (lastParagraphClipped && last?.type === 'paragraph') {
          last.raw += (last.raw.endsWith('\n') ? '' : '\n') + tok.raw;
          last.text += '\n' + tok.text;
          this.inlineQueue.pop();
          this.inlineQueue[this.inlineQueue.length - 1].src = last.text;
        } else tokens.push(tok);
        lastParagraphClipped = false;
        src = src.substring(tok.raw.length);
        continue;
      }
      if ((tok = this.text(src))) {
        src = src.substring(tok.raw.length);
        last = tokens[tokens.length - 1];
        if (last?.type === 'text') {
          last.raw += (last.raw.endsWith('\n') ? '' : '\n') + tok.raw;
          last.text += '\n' + tok.text;
          this.inlineQueue.pop();
          this.inlineQueue[this.inlineQueue.length - 1].src = last.text;
        } else tokens.push(tok);
        continue;
      }
      if (src) throw new Error('Infinite loop on byte: ' + src.charCodeAt(0));
    }
    this.top = true;
    return tokens;
  }

  // ----- block tokenizers -----
  space(src) {
    const cap = bNewline.exec(src);
    if (cap && cap[0].length > 0) return { type: 'space', raw: cap[0] };
  }

  code(src) {
    const cap = bCode.exec(src);
    if (cap) {
      const raw = trimTrailingBlankLines(cap[0]);
      return { type: 'code', raw, codeBlockStyle: 'indented', text: raw.replace(reCodeRemoveIndent, '') };
    }
  }

  fences(src) {
    const cap = bFences.exec(src);
    if (cap) {
      const raw = cap[0];
      const text = indentCodeCompensation(raw, cap[3] || '');
      return { type: 'code', raw, lang: cap[2] ? cap[2].trim().replace(iAnyPunctuation, '$1') : cap[2], text };
    }
  }

  heading(src) {
    const cap = bHeading.exec(src);
    if (cap) {
      let text = cap[2].trim();
      if (reEndingHash.test(text)) {
        const trimmed = rtrim(text, '#');
        if (!trimmed || reEndingSpaceTabChar.test(trimmed)) text = trimmed.trim();
      }
      return { type: 'heading', raw: rtrim(cap[0], '\n'), depth: cap[1].length, text, tokens: this.inline(text) };
    }
  }

  hr(src) {
    const cap = bHr.exec(src);
    if (cap) return { type: 'hr', raw: rtrim(cap[0], '\n') };
  }

  blockquote(src) {
    const cap = bBlockquote.exec(src);
    if (!cap) return;
    let lines = rtrim(cap[0], '\n').split('\n');
    let raw = '';
    let text = '';
    const tokens = [];
    while (lines.length > 0) {
      let inBlockquote = false;
      const currentLines = [];
      let i;
      for (i = 0; i < lines.length; i++) {
        if (reBlockquoteStart.test(lines[i])) {
          currentLines.push(lines[i]);
          inBlockquote = true;
        } else if (!inBlockquote) {
          currentLines.push(lines[i]);
        } else break;
      }
      lines = lines.slice(i);
      const currentRaw = currentLines.join('\n');
      const currentText = currentRaw
        .replace(reBlockquoteMarkerWhitespace, (m, marker, ws) => marker + expandTabs(ws, marker.length))
        .replace(reBlockquoteSetextReplace, '\n    $1')
        .replace(reBlockquoteSetextReplace2, '');
      raw = raw ? `${raw}\n${currentRaw}` : currentRaw;
      text = text ? `${text}\n${currentText}` : currentText;
      const top = this.top;
      this.top = true;
      this.blockTokens(currentText, tokens, true);
      this.top = top;
      if (lines.length === 0) break;
      const lastToken = tokens[tokens.length - 1];
      const lt = lastToken?.type;
      if (lt === 'code' || lt === 'heading' || lt === 'hr' || lt === 'html' || lt === 'table') break;
      if (lt === 'blockquote') {
        const oldToken = lastToken;
        const newText = oldToken.raw + '\n' + lines.join('\n').replace(reBlockquoteSetextReplace2, '');
        const newToken = this.blockquote(newText);
        tokens[tokens.length - 1] = newToken;
        const rest = newText.substring(newToken.raw.length).replace(reLeadingNewline, '');
        const restCount = rest ? rest.split('\n').length : 0;
        const consumed = restCount ? lines.slice(0, -restCount) : lines;
        if (consumed.length > 0) raw = `${raw}\n${consumed.join('\n')}`;
        text = text.substring(0, text.length - oldToken.text.length) + newToken.text;
        lines = lines.slice(consumed.length);
        if (lines.length > 0 && reBlockquoteStart.test(lines[0])) continue;
        break;
      } else if (lt === 'list') {
        const oldToken = lastToken;
        const newText = oldToken.raw + '\n' + lines.join('\n');
        const newToken = this.list(newText);
        tokens[tokens.length - 1] = newToken;
        const consumed = newToken.raw.length > oldToken.raw.length
          ? newText.slice(oldToken.raw.length + 1, newToken.raw.length).split('\n').length
          : 0;
        if (consumed > 0) {
          const joined = lines.slice(0, consumed).join('\n');
          raw = `${raw}\n${joined}`;
          text = `${text}\n${joined}`;
        }
        lines = lines.slice(consumed);
        continue;
      }
    }
    return { type: 'blockquote', raw, tokens, text };
  }

  list(src) {
    let cap = bList.exec(src);
    if (!cap) return;
    const orig = src;
    const consumedLen = () => orig.length - src.length;
    let bull = cap[1].trim();
    const ordered = bull.length > 1;
    const list = { type: 'list', raw: '', ordered, start: ordered ? +bull.slice(0, -1) : '', loose: false, items: [] };
    bull = ordered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;
    const itemRegex = listItemRegex(bull);
    let endsWithBlankLine = false;
    while (src) {
      let endEarly = false;
      let itemContents = '';
      if (!(cap = itemRegex.exec(src)) || bHr.test(src)) break;
      const startPos = consumedLen();
      src = src.substring(cap[0].length);
      const firstLine = cap[2].split('\n', 1)[0];
      const markerLen = cap[1].length;
      let line = firstLine.replace(reLeadingSpaceTab, (ws) => expandTabs(ws, markerLen));
      let nextLine = src.split('\n', 1)[0];
      let blankLine = !line.trim();
      let indent = 0;
      if (blankLine) {
        indent = markerLen + 1;
      } else {
        indent = line.search(reNonSpaceChar);
        indent = indent > 4 ? 1 : indent;
        itemContents = line.slice(indent);
        indent += markerLen;
      }
      if (blankLine && reBlankLine.test(nextLine)) {
        src = src.substring(nextLine.length + 1);
        endEarly = true;
      }
      if (!endEarly) {
        const nextBullet = nextBulletRegex(indent);
        const hrRe = hrRegex(indent);
        const fenceRe = fencesBeginRegex(indent);
        const headingRe = headingBeginRegex(indent);
        const htmlRe = htmlBeginRegex(indent);
        const bqRe = blockquoteBeginRegex(indent);
        while (src) {
          const rawLine = src.split('\n', 1)[0];
          nextLine = rawLine;
          const nextLineWithoutTabs = nextLine.replace(reLeadingSpaceTab, (ws) => expandTabs(ws));
          if (fenceRe.test(nextLine) || headingRe.test(nextLine) || htmlRe.test(nextLine) ||
              bqRe.test(nextLine) || nextBullet.test(nextLine) || hrRe.test(nextLine)) break;
          if (nextLineWithoutTabs.search(reNonSpaceChar) >= indent || !nextLine.trim()) {
            itemContents += '\n' + nextLineWithoutTabs.slice(indent);
          } else {
            if (blankLine) break;
            if (line.replace(reTabCharGlobal, '    ').search(reNonSpaceChar) >= 4) break;
            if (fenceRe.test(line) || headingRe.test(line) || htmlRe.test(line) || hrRe.test(line)) break;
            const add = reSetextUnderline.test(nextLine) && bLheading.test(`${line}\n${nextLine}`)
              ? `    ${nextLineWithoutTabs.replace(reUpTo3Spaces, '')}`
              : nextLine;
            itemContents += '\n' + add;
          }
          blankLine = !nextLine.trim();
          src = src.substring(rawLine.length + 1);
          line = nextLineWithoutTabs.slice(indent);
        }
      }
      const raw = orig.slice(startPos, consumedLen());
      if (!list.loose) {
        if (endsWithBlankLine) list.loose = true;
        else if (reDoubleBlankLine.test(raw)) endsWithBlankLine = true;
      }
      list.items.push({ type: 'list_item', raw, task: reListIsTask.test(itemContents), loose: false, text: itemContents, tokens: [] });
    }
    const lastItem = list.items[list.items.length - 1];
    if (!lastItem) return;
    lastItem.raw = lastItem.raw.trimEnd();
    lastItem.text = lastItem.text.trimEnd();
    list.raw = orig.slice(0, consumedLen()).trimEnd();
    for (const item of list.items) {
      this.top = false;
      item.tokens = this.blockTokens(item.text, []);
      if (!list.loose) {
        let loose = false;
        for (const t of item.tokens) {
          if (t.type === 'space' && reAnyLine.test(t.raw)) {
            loose = true;
            break;
          }
        }
        list.loose = loose;
      }
    }
    for (const item of list.items) {
      const first = item.tokens[0];
      if (item.task && (first?.type === 'text' || first?.type === 'paragraph')) {
        item.text = item.text.replace(reListReplaceTask, '');
        first.raw = first.raw.replace(reListReplaceTask, '');
        first.text = first.text.replace(reListReplaceTask, '');
        const q = this.inlineQueue;
        for (let i = q.length - 1; i >= 0; i--) {
          if (reListIsTask.test(q[i].src)) {
            q[i].src = q[i].src.replace(reListReplaceTask, '');
            break;
          }
        }
        const box = reListTaskCheckbox.exec(item.raw);
        if (box) {
          const checkbox = { type: 'checkbox', raw: box[0] + ' ', checked: box[0] !== '[ ]' };
          item.checked = checkbox.checked;
          if (list.loose) {
            const t0 = item.tokens[0];
            if (t0 && (t0.type === 'paragraph' || t0.type === 'text') && t0.tokens) {
              t0.raw = checkbox.raw + t0.raw;
              t0.text = checkbox.raw + t0.text;
              t0.tokens.unshift(checkbox);
            } else {
              item.tokens.unshift({ type: 'paragraph', raw: checkbox.raw, text: checkbox.raw, tokens: [checkbox] });
            }
          } else {
            item.tokens.unshift(checkbox);
          }
        }
      } else if (item.task) {
        item.task = false;
      }
    }
    if (list.loose) {
      for (const item of list.items) {
        item.loose = true;
        for (const t of item.tokens) if (t.type === 'text') t.type = 'paragraph';
      }
    }
    return list;
  }

  html(src) {
    const cap = bHtml.exec(src);
    if (cap) {
      const text = trimTrailingBlankLines(cap[0]);
      return { type: 'html', block: true, raw: text, pre: cap[1] === 'pre' || cap[1] === 'script' || cap[1] === 'style', text };
    }
  }

  def(src) {
    const cap = bDef.exec(src);
    if (cap) {
      if (!reStartAngleBracket.test(cap[2]) && findClosingBracket(cap[2], '()') !== -1) return;
      const tag = normalizeLabel(cap[1]);
      const href = cap[2] ? cap[2].replace(reHrefBrackets, '$1').replace(iAnyPunctuation, '$1') : '';
      const title = cap[3] ? cap[3].substring(1, cap[3].length - 1).replace(iAnyPunctuation, '$1') : cap[3];
      return { type: 'def', tag, raw: rtrim(cap[0], '\n'), href, title };
    }
  }

  table(src) {
    const cap = bTable.exec(src);
    if (!cap || !reTableDelimiter.test(cap[2])) return;
    const headers = splitCells(cap[1]);
    const aligns = cap[2].replace(reTableAlignChars, '').split('|');
    const rows = cap[3]?.trim() ? cap[3].replace(reTableRowBlankLine, '').split('\n') : [];
    const item = { type: 'table', raw: rtrim(cap[0], '\n'), header: [], align: [], rows: [] };
    if (headers.length !== aligns.length) return;
    for (const a of aligns) {
      if (reTableAlignRight.test(a)) item.align.push('right');
      else if (reTableAlignCenter.test(a)) item.align.push('center');
      else if (reTableAlignLeft.test(a)) item.align.push('left');
      else item.align.push(null);
    }
    for (let i = 0; i < headers.length; i++) {
      item.header.push({ text: headers[i], tokens: this.inline(headers[i]), header: true, align: item.align[i] });
    }
    for (const row of rows) {
      item.rows.push(splitCells(row, item.header.length).map((cell, j) => ({
        text: cell, tokens: this.inline(cell), header: false, align: item.align[j],
      })));
    }
    return item;
  }

  lheading(src) {
    const cap = bLheading.exec(src);
    if (cap) {
      const text = cap[1].trim();
      return { type: 'heading', raw: rtrim(cap[0], '\n'), depth: cap[2].charAt(0) === '=' ? 1 : 2, text, tokens: this.inline(text) };
    }
  }

  paragraph(src) {
    const cap = bParagraph.exec(src);
    if (cap) {
      const c1 = cap[1];
      const text = c1.charAt(c1.length - 1) === '\n' ? c1.slice(0, -1) : c1;
      return { type: 'paragraph', raw: cap[0], text, tokens: this.inline(text) };
    }
  }

  text(src) {
    const cap = bText.exec(src);
    if (cap) return { type: 'text', raw: cap[0], text: cap[0], tokens: this.inline(cap[0]) };
  }

  // ----- inline -----
  linkInText(text) {
    if (!text.includes('[')) return false;
    for (const m of text.matchAll(iBlockSkip)) {
      if (iLink.test(m[0]) && text.charAt(m.index - 1) !== '!') return true;
    }
    for (const m of text.matchAll(iReflinkSearch)) {
      const s = m[0];
      const r = s.lastIndexOf('[');
      if (s.charAt(0) === '!' || !Object.hasOwn(this.links, normalizeLabel(s.slice(r + 1, -1)))) continue;
      if (r > 1 && this.linkInText(s.slice(1, r - 1))) continue;
      return true;
    }
    return false;
  }

  inlineTokens(src, tokens = []) {
    const prev = this.linkParenPossible;
    this.linkParenPossible = prev && src.includes(')');
    try {
      const masked = src.includes('*') || src.includes('_') || src.includes('~') ? this.mask(src) : src;
      this.closers.push(closerInfo(masked));
      try {
        return this.inlineLoop(src, masked, tokens);
      } finally {
        this.closers.pop();
      }
    } finally {
      this.linkParenPossible = prev;
    }
  }

  mask(src) {
    let out = src;
    if (src.includes('[')) {
      const links = this.links;
      const repl = (s) => {
        const o = s.lastIndexOf('[');
        if (!Object.hasOwn(links, normalizeLabel(s.slice(o + 1, -1)))) return s;
        if (o > 1 && s.charAt(0) !== '!') {
          const inner = s.slice(1, o - 1);
          if (this.linkInText(inner)) return '[' + inner.replace(iReflinkSearch, repl) + '][' + 'a'.repeat(s.length - o - 2) + ']';
        }
        return '[' + 'a'.repeat(s.length - 2) + ']';
      };
      out = out.replace(iReflinkSearch, repl);
    }
    out = out.replace(iAnyPunctuationOutsideCode, (m, ticks, esc) =>
      esc ? '+'.repeat(m.length) : ticks ? ticks + m.slice(ticks.length, -ticks.length).replace(reBacktickGlobal, '+') + ticks : m);
    out = out.replace(iBlockSkip, (m, a, pre) => {
      const k = pre ? pre.length : 0;
      return m.slice(0, k) + '[' + 'a'.repeat(m.length - k - 2) + ']';
    });
    return out;
  }

  closerFor(masked) {
    const top = this.closers[this.closers.length - 1];
    return top && top.masked === masked ? top : closerInfo(masked);
  }

  inlineLoop(src, masked, tokens) {
    let keepPrevChar = false;
    let prevChar = '';
    let minLen = Infinity;
    while (src) {
      if (src.length < minLen) minLen = src.length;
      else throw new Error('Infinite loop on byte: ' + src.charCodeAt(0));
      if (!keepPrevChar) prevChar = '';
      keepPrevChar = false;
      let tok;
      if ((tok = this.escape(src)) || (tok = this.tag(src)) || (tok = this.link(src))) {
        src = src.substring(tok.raw.length);
        tokens.push(tok);
        continue;
      }
      if ((tok = this.reflink(src))) {
        src = src.substring(tok.raw.length);
        const last = tokens[tokens.length - 1];
        if (tok.type === 'text' && last?.type === 'text') {
          last.raw += tok.raw;
          last.text += tok.text;
        } else tokens.push(tok);
        continue;
      }
      if ((tok = this.emStrong(src, masked, prevChar)) || (tok = this.codespan(src)) || (tok = this.br(src)) ||
          (tok = this.del(src, masked, prevChar)) || (tok = this.autolink(src)) || (!this.inLink && (tok = this.url(src)))) {
        src = src.substring(tok.raw.length);
        tokens.push(tok);
        continue;
      }
      if ((tok = this.inlineText(src))) {
        src = src.substring(tok.raw.length);
        if (tok.raw.slice(-1) !== '_') prevChar = tok.raw.slice(-1);
        keepPrevChar = true;
        const last = tokens[tokens.length - 1];
        if (last?.type === 'text') {
          last.raw += tok.raw;
          last.text += tok.text;
        } else tokens.push(tok);
        continue;
      }
      if (src) throw new Error('Infinite loop on byte: ' + src.charCodeAt(0));
    }
    return tokens;
  }

  escape(src) {
    const cap = iEscape.exec(src);
    if (cap) return { type: 'escape', raw: cap[0], text: cap[1] };
  }

  tag(src) {
    const cap = iTag.exec(src);
    if (!cap) return;
    const raw = cap[0];
    if (!this.inLink && reStartATag.test(raw)) this.inLink = true;
    else if (this.inLink && reEndATag.test(raw)) this.inLink = false;
    if (!this.inRawBlock && reStartPreScriptTag.test(raw)) this.inRawBlock = true;
    else if (this.inRawBlock && reEndPreScriptTag.test(raw)) this.inRawBlock = false;
    return { type: 'html', raw, inLink: this.inLink, inRawBlock: this.inRawBlock, block: false, text: raw };
  }

  // A `<` inside the link text that starts a tag/autolink running past the text's end blocks the link.
  htmlEscapesLabel(src, label, offset) {
    if (!label.includes('<')) return false;
    for (let i = 0; i < label.length; i++) {
      if (label[i] === '\\') {
        i++;
        continue;
      }
      if (label[i] === '`') {
        const m = iCode.exec(label.slice(i));
        if (m) {
          i += m[0].length - 1;
          continue;
        }
      }
      if (label[i] !== '<') continue;
      const rest = src.slice(offset + i);
      const m = iTag.exec(rest) || iAutolink.exec(rest);
      if (m) {
        if (m[0].length > label.length - i) return true;
        i += m[0].length - 1;
      }
    }
    return false;
  }

  outputLink(cap, link, raw) {
    const href = link.href;
    const title = link.title || null;
    const text = cap[1].replace(reOutputLinkReplace, '$1');
    const isImage = cap[0].charAt(0) === '!';
    const prevInLink = this.inLink;
    const prevEmitted = this.linkEmitted;
    const prevRaw = this.inRawBlock;
    this.inLink = true;
    this.linkEmitted = false;
    const tokens = this.inlineTokens(text);
    const emitted = this.linkEmitted;
    this.linkEmitted = prevEmitted;
    this.inLink = prevInLink;
    if (!isImage) {
      if (emitted) {
        this.inRawBlock = prevRaw;
        return;
      }
      this.linkEmitted = true;
    }
    return { type: isImage ? 'image' : 'link', raw, href, title, text, tokens };
  }

  link(src) {
    if (this.linkParenPossible === false) return;
    const cap = iLink.exec(src);
    if (!cap) return;
    const offset = cap[0].charAt(0) === '!' ? 2 : 1;
    if (this.htmlEscapesLabel(src, cap[1], offset)) return;
    const trimmedUrl = cap[2].trim();
    if (reStartAngleBracket.test(trimmedUrl)) {
      if (!reEndAngleBracket.test(trimmedUrl)) return;
      const rt = rtrim(trimmedUrl.slice(0, -1), '\\');
      if ((trimmedUrl.length - rt.length) % 2 === 0) return;
    } else {
      const lastParen = findClosingBracket(cap[2], '()');
      if (lastParen === -2) return;
      if (lastParen > -1) {
        const start = cap[0].indexOf('!') === 0 ? 5 : 4;
        const linkLen = start + cap[1].length + lastParen;
        cap[2] = cap[2].substring(0, lastParen);
        cap[0] = cap[0].substring(0, linkLen).trim();
        cap[3] = '';
      }
    }
    const rt0 = rtrim(cap[0].slice(0, -1), '\\');
    if ((cap[0].length - rt0.length) % 2 === 0) return;
    let href = cap[2];
    const title = cap[3] ? cap[3].slice(1, -1) : '';
    href = href.trim();
    if (reStartAngleBracket.test(href)) href = href.slice(1, -1);
    return this.outputLink(cap, {
      href: href ? href.replace(iAnyPunctuation, '$1') : href,
      title: title ? title.replace(iAnyPunctuation, '$1') : title,
    }, cap[0]);
  }

  reflink(src) {
    let cap;
    if ((cap = iReflink.exec(src)) || (cap = iNolink.exec(src))) {
      const offset = cap[0].charAt(0) === '!' ? 2 : 1;
      if (this.htmlEscapesLabel(src, cap[1], offset)) return;
      const link = this.links[normalizeLabel(cap[2] || cap[1])];
      if (!link) {
        const ch = cap[0].charAt(0);
        return { type: 'text', raw: ch, text: ch };
      }
      return this.outputLink(cap, link, cap[0]);
    }
  }

  emStrong(src, masked, prevChar = '') {
    let match = iEmStrongLDelim.exec(src);
    if (!match || (!match[1] && !match[2] && !match[3] && !match[4])) return;
    const lDelimChar = match[0][0];
    const sameAsPrev = prevChar === lDelimChar;
    const pos = masked.length - src.length;
    let runStart = pos;
    while (runStart > 0 && masked[runStart - 1] === lDelimChar) runStart--;
    const beforeRun = [...masked.slice(Math.max(0, runStart - 2), runStart)].at(-1) ?? '';
    const beforeIsPunct = beforeRun === '*' || beforeRun === '_' || !!iPunctuation.exec(beforeRun);
    if (runStart < pos) prevChar = beforeRun;
    const prevIsPunct = runStart < pos ? beforeIsPunct : !!iPunctuation.exec(prevChar);
    if (match[4] && prevChar.match(reUnicodeAlphaNumeric)) return;
    const nextChar = match[1] || match[3] || '';
    if (nextChar && prevChar && !prevIsPunct) return;
    const lLength = [...match[0]].length - 1;
    let rDelim;
    let rLength;
    let delimTotal = lLength;
    let midDelimTotal = 0;
    const runLen = pos - runStart + lLength;
    const leftFlankingBoth = !!beforeRun.trim() && (!!nextChar || (lDelimChar === '*' && !beforeIsPunct));
    if (lDelimChar !== '*' && lDelimChar !== '_') return;
    const endReg = lDelimChar === '*' ? iEmStrongRDelimAst : iEmStrongRDelimUnd;
    const info = this.closerFor(masked);
    const lastCloser = lDelimChar === '*' ? info.star : info.under;
    const searchStart = masked.length - src.length + lLength;
    if (lastCloser < searchStart) return;
    masked = masked.slice(-1 * src.length + lLength);
    const maxIndex = lastCloser - searchStart;
    endReg.lastIndex = 0;
    while ((match = endReg.exec(masked)) !== null && !(match.index > maxIndex)) {
      rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
      if (!rDelim) continue;
      rLength = [...rDelim].length;
      if (match[3] || match[4]) {
        delimTotal += rLength;
        continue;
      } else if (match[5] || match[6] || leftFlankingBoth) {
        if (sameAsPrev && (match[5] || match[6])) break;
        if (runLen % 3 && !((runLen + rLength) % 3)) {
          midDelimTotal += rLength;
          continue;
        }
      }
      delimTotal -= rLength;
      if (delimTotal > 0) continue;
      rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
      const firstLen = [...match[0]][0].length;
      const raw = src.slice(0, lLength + match.index + firstLen + rLength);
      if (Math.min(lLength, rLength) % 2) {
        const text = raw.slice(1, -1);
        return { type: 'em', raw, text, tokens: this.inlineTokens(text) };
      }
      const text = raw.slice(2, -2);
      return { type: 'strong', raw, text, tokens: this.inlineTokens(text) };
    }
  }

  codespan(src) {
    const cap = iCode.exec(src);
    if (cap) {
      let text = cap[2].replace(reNewLineCharGlobal, ' ');
      const hasNonSpace = reNonSpaceChar.test(text);
      const padded = reStartingSpaceChar.test(text) && reEndingSpaceChar.test(text);
      if (hasNonSpace && padded) text = text.substring(1, text.length - 1);
      return { type: 'codespan', raw: cap[0], text };
    }
  }

  br(src) {
    const cap = iBr.exec(src);
    if (cap) return { type: 'br', raw: cap[0] };
  }

  del(src, masked, prevChar = '') {
    let match = iDelLDelim.exec(src);
    if (!match) return;
    const nextChar = match[1] || '';
    if (nextChar && prevChar && !iPunctuation.exec(prevChar)) return;
    const lLength = [...match[0]].length - 1;
    let rDelim;
    let rLength;
    let delimTotal = lLength;
    const endReg = iDelRDelim;
    const lastCloser = this.closerFor(masked).tilde;
    const searchStart = masked.length - src.length + lLength;
    if (lastCloser < searchStart) return;
    masked = masked.slice(-1 * src.length + lLength);
    const maxIndex = lastCloser - searchStart;
    endReg.lastIndex = 0;
    while ((match = endReg.exec(masked)) !== null && !(match.index > maxIndex)) {
      rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
      if (!rDelim) continue;
      rLength = [...rDelim].length;
      if (rLength !== lLength) continue;
      if (match[3] || match[4]) {
        delimTotal += rLength;
        continue;
      }
      delimTotal -= rLength;
      if (delimTotal > 0) continue;
      rLength = Math.min(rLength, rLength + delimTotal);
      const firstLen = [...match[0]][0].length;
      const raw = src.slice(0, lLength + match.index + firstLen + rLength);
      const text = raw.slice(lLength, -lLength);
      return { type: 'del', raw, text, tokens: this.inlineTokens(text) };
    }
  }

  autolink(src) {
    const cap = iAutolink.exec(src);
    if (cap) {
      const text = cap[1];
      const href = cap[2] === '@' ? 'mailto:' + text : text;
      return { type: 'link', raw: cap[0], text, href, autolink: true, tokens: [{ type: 'text', raw: text, text }] };
    }
  }

  url(src) {
    const cap = iUrl.exec(src);
    if (!cap) return;
    let text;
    let href;
    if (cap[2] === '@') {
      text = cap[0];
      href = 'mailto:' + text;
    } else {
      let prev;
      do {
        prev = cap[0];
        cap[0] = iBackpedal.exec(cap[0])?.[0] ?? '';
      } while (prev !== cap[0]);
      text = cap[0];
      href = cap[1] === 'www.' ? 'http://' + cap[0] : cap[0];
    }
    return { type: 'link', raw: cap[0], text, href, autolink: true, tokens: [{ type: 'text', raw: text, text }] };
  }

  inlineText(src) {
    const cap = iText.exec(src);
    if (cap) {
      const raw = cap[0];
      const escaped = this.inRawBlock;
      return { type: 'text', raw, text: escaped ? raw : decodeNumericRefs(raw), escaped };
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Renderer
function renderBlocks(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'space':
      case 'def':
        break;
      case 'hr':
        out += '<hr>\n';
        break;
      case 'heading':
        out += `<h${t.depth}>${renderInline(t.tokens)}</h${t.depth}>\n`;
        break;
      case 'code':
        out += renderCode(t);
        break;
      case 'table':
        out += renderTable(t);
        break;
      case 'blockquote':
        out += `<blockquote>\n${renderBlocks(t.tokens)}</blockquote>\n`;
        break;
      case 'list':
        out += renderList(t);
        break;
      case 'checkbox':
        out += renderCheckbox(t);
        break;
      case 'html':
        out += t.text;
        break;
      case 'paragraph':
        out += `<p>${renderInline(t.tokens)}</p>\n`;
        break;
      case 'text':
        out += t.tokens ? renderInline(t.tokens) : t.escaped ? t.text : escapeHtml(t.text);
        break;
      default:
        throw new Error('Token with "' + t.type + '" type was not found.');
    }
  }
  return out;
}

function renderCode(t) {
  const lang = (t.lang || '').match(reNotSpaceStart)?.[0];
  const code = t.text ? t.text.replace(reEndingNewline, '') + '\n' : '';
  const body = t.escaped ? code : escapeHtml(code, true);
  if (lang) return '<pre><code class="language-' + escapeHtml(lang) + '">' + body + '</code></pre>\n';
  return '<pre><code>' + body + '</code></pre>\n';
}

function renderCheckbox(t) {
  return '<input ' + (t.checked ? 'checked="" ' : '') + 'disabled="" type="checkbox"> ';
}

function renderList(t) {
  let body = '';
  for (let i = 0; i < t.items.length; i++) body += `<li>${renderBlocks(t.items[i].tokens)}</li>\n`;
  const tag = t.ordered ? 'ol' : 'ul';
  const start = t.ordered && t.start !== 1 ? ' start="' + t.start + '"' : '';
  return '<' + tag + start + '>\n' + body + '</' + tag + '>\n';
}

function renderCell(cell) {
  const content = renderInline(cell.tokens);
  const tag = cell.header ? 'th' : 'td';
  return (cell.align ? `<${tag} align="${cell.align}">` : `<${tag}>`) + content + `</${tag}>\n`;
}

function renderTable(t) {
  let cells = '';
  for (let i = 0; i < t.header.length; i++) cells += renderCell(t.header[i]);
  const head = `<tr>\n${cells}</tr>\n`;
  let body = '';
  for (let r = 0; r < t.rows.length; r++) {
    const row = t.rows[r];
    cells = '';
    for (let i = 0; i < row.length; i++) cells += renderCell(row[i]);
    body += `<tr>\n${cells}</tr>\n`;
  }
  if (body) body = `<tbody>${body}</tbody>`;
  return '<table>\n<thead>\n' + head + '</thead>\n' + body + '</table>\n';
}

function renderInline(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'escape':
        out += escapeHtml(t.text);
        break;
      case 'html':
        out += t.text;
        break;
      case 'link':
        out += renderLink(t);
        break;
      case 'image':
        out += renderImage(t);
        break;
      case 'checkbox':
        out += renderCheckbox(t);
        break;
      case 'strong':
        out += `<strong>${renderInline(t.tokens)}</strong>`;
        break;
      case 'em':
        out += `<em>${renderInline(t.tokens)}</em>`;
        break;
      case 'codespan':
        out += `<code>${escapeHtml(t.text, true)}</code>`;
        break;
      case 'br':
        out += '<br>';
        break;
      case 'del':
        out += `<del>${renderInline(t.tokens)}</del>`;
        break;
      case 'text':
        out += t.tokens ? renderInline(t.tokens) : t.escaped ? t.text : escapeHtml(t.text);
        break;
      default:
        throw new Error('Token with "' + t.type + '" type was not found.');
    }
  }
  return out;
}

function renderLink(t) {
  const text = t.autolink ? escapeHtml(t.text, true) : renderInline(t.tokens);
  const href = cleanUrl(t.href);
  if (href === null) return text;
  let out = '<a href="' + escapeHtml(href, t.autolink) + '"';
  if (t.title) out += ' title="' + escapeHtml(t.title) + '"';
  return out + '>' + text + '</a>';
}

// Plain-text rendering (used for image alt text).
function renderPlain(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'strong':
      case 'em':
      case 'del':
      case 'link':
      case 'image':
        out += t.tokens ? renderPlain(t.tokens) : t.text;
        break;
      case 'br':
        break;
      case 'checkbox':
        out += t.raw;
        break;
      default:
        out += t.text;
    }
  }
  return out;
}

function renderImage(t) {
  const text = t.tokens ? renderPlain(t.tokens) : t.text;
  const href = cleanUrl(t.href);
  if (href === null) return escapeHtml(text);
  let out = `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"`;
  if (t.title) out += ` title="${escapeHtml(t.title)}"`;
  return out + '>';
}

/** The HTML marked 18.1.3 renders for `markdown` with its default options. */
export function parse(markdown) {
  return renderBlocks(new Lexer().lex(markdown));
}
