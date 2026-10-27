/** 青空文庫書式の制御文字と、その代替表記 */
export const AOZORA_ESCAPE_ENTITIES: Readonly<Record<string, string>> = {
  "《": "※［＃始め二重山括弧、1-1-52］",
  "》": "※［＃終わり二重山括弧、1-1-53］",
  "［": "※［＃始め角括弧、1-1-46］",
  "］": "※［＃終わり角括弧、1-1-47］",
  "〔": "※［＃始めきっこう（亀甲）括弧、1-1-44］",
  "〕": "※［＃終わりきっこう（亀甲）括弧、1-1-45］",
  "｜": "※［＃縦線、1-1-35］",
  "＃": "※［＃井げた、1-1-84］",
  "※": "※［＃米印、1-2-8］",
};

const ESCAPE_REGEXP = new RegExp(`[${Object.keys(AOZORA_ESCAPE_ENTITIES).join("")}]`, "g");

/** 青空文庫の制御文字をエスケープする */
export const escapeAozoraTag = (text: string): string =>
  text.replace(ESCAPE_REGEXP, (m) => AOZORA_ESCAPE_ENTITIES[m] ?? m);

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  quot: '"',
  amp: "&",
  nbsp: " ",
  lt: "<",
  gt: ">",
  copy: "(c)",
  "#39": "'",
};

const ENTITY_REGEXP = new RegExp(`&(${Object.keys(HTML_ENTITIES).join("|")});`, "g");

const convertRuby = (inner: string): string => {
  const rubyTexts = [...inner.matchAll(/<rt>(.*?)<\/rt>/gi)].map((m) => m[1] ?? "");
  const rubyBase = inner
    .replace(/<rb\/?>/, "")
    .replace(/<[^>]+>.*?<\/[^>]+>/g, "")
    .replace(/<.+?>/g, "");
  return rubyTexts.length === 0 ? rubyBase : `｜${rubyBase}《${rubyTexts.join("")}》`;
};

/** 本文HTMLを青空文庫形式のテキストへ変換する */
export const toAozora = (html: string): string => {
  let text = html
    .replace(/[\r\n]+/g, "")
    .replace(/<br.*?>/gi, "\n")
    .replace(/\n?<\/p>/gi, "\n");
  text = escapeAozoraTag(text)
    // サイト側アダプタが挿入する独自タグ (改ページ・見出し)
    .replace(/<newpage\s*\/?>/gi, "\n［＃改ページ］\n")
    .replace(/<heading>(.*?)<\/heading>/gi, "\n［＃３字下げ］［＃中見出し］$1［＃中見出し終わり］\n")
    .replace(/<ruby>(.+?)<\/ruby>/gi, (_, inner: string) => convertRuby(inner))
    .replace(/<b>(.+?)<\/b>/gi, "［＃太字］$1［＃太字終わり］")
    .replace(/<i>(.+?)<\/i>/gi, "［＃斜体］$1［＃斜体終わり］")
    .replace(/<s>(.+?)<\/s>/gi, "［＃取消線］$1［＃取消線終わり］")
    .replace(/<em class="emphasisDots">(.+?)<\/em>/g, "［＃傍点］$1［＃傍点終わり］")
    .replace(/<.+?>/g, "");
  // 1回のパスで置換する (順に置換すると &amp;lt; が < まで二重にデコードされる)
  return text.replace(ENTITY_REGEXP, (match, name: string) => HTML_ENTITIES[name] ?? match);
};
