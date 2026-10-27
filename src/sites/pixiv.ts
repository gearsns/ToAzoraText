import type { Subtitle, Toc } from "../core/types";
import type { ApiSiteAdapter, EpisodeContext, TocContext } from "./types";

/**
 * pixiv 小説。HTML ではなく ajax API (JSON) から取得する。
 *
 * 作品コード (保存フォルダ名にも使う):
 *   series-123 … シリーズ (https://www.pixiv.net/novel/series/123)
 *   novel-456  … 単独作品 (https://www.pixiv.net/novel/show.php?id=456)
 */

export type PixivCode = { kind: "series" | "novel"; id: string };

const CODE_PATTERN = /^(series|novel)-(\d+)$/;

export const parseCode = (code: string): PixivCode | null => {
  const m = CODE_PATTERN.exec(code);
  return m ? { kind: m[1] as PixivCode["kind"], id: m[2] as string } : null;
};

export const extractCode = (url: string): string | null => {
  const series = url.match(/pixiv\.net\/(?:[a-z]{2}\/)?novel\/series\/(\d+)/);
  if (series) return `series-${series[1]}`;
  const novel = url.match(/pixiv\.net\/(?:[a-z]{2}\/)?novel\/show\.php\?(?:.*&)?id=(\d+)/);
  if (novel) return `novel-${novel[1]}`;
  return null;
};

const SERIES_PAGE_SIZE = 20;
/** 無限ループ防止 (20件 × 500ページ = 1万話) */
const MAX_SERIES_PAGES = 500;

const novelPath = (id: string) => `/novel/show.php?id=${id}`;
const novelIdFromHref = (href: string): string | null => /[?&]id=(\d+)/.exec(href)?.[1] ?? null;

// ---- API レスポンス (緩く扱う) ----
type Json = Record<string, any>;

/** pixiv API は失敗しても 200 で { error: true, message } を返す */
const getBody = (json: unknown): Json => {
  const res = json as Json | null;
  if (!res || res["error"]) {
    throw new Error(`pixiv API エラー: ${res?.["message"] || "不明なエラー"}`);
  }
  return (res["body"] ?? {}) as Json;
};

const toIso = (seconds: unknown): string | undefined =>
  typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : undefined;

const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " " };

/** あらすじ (HTML) をプレーンテキストにする */
export const htmlToPlain = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, name: string) => {
      if (name[0] === "#") {
        const code = name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isNaN(code) ? m : String.fromCodePoint(code);
      }
      return HTML_ENTITIES[name.toLowerCase()] ?? m;
    })
    .trim();

const escapeText = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// [[rb:漢字 > かんじ]] / [[jumpuri:題 > URL]] / [newpage] / [chapter:題] / 画像・ジャンプ
const MARKUP =
  /\[\[rb:(.+?)\s*>\s*(.+?)\]\]|\[\[jumpuri:(.+?)\s*>\s*(.+?)\]\]|\[newpage\]|\[chapter:(.*?)\]|\[pixivimage:[^\]]*\]|\[uploadedimage:[^\]]*\]|\[jump:[^\]]*\]/g;

/**
 * pixiv 独自記法のテキストを、toAozora が解釈できる HTML にする。
 * 改行は <br>、ルビは <ruby>、改ページ・見出しは独自タグ (<newpage> / <heading>) にする。
 */
export const pixivTextToHtml = (text: string): string => {
  let html = "";
  let last = 0;
  for (const m of text.matchAll(MARKUP)) {
    html += escapeText(text.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    if (m[1] !== undefined) {
      html += `<ruby>${escapeText(m[1])}<rt>${escapeText(m[2] ?? "")}</rt></ruby>`;
    } else if (m[3] !== undefined) {
      html += escapeText(m[3]); // リンクは題だけ残す
    } else if (m[5] !== undefined) {
      html += `<heading>${escapeText(m[5])}</heading>`;
    } else if (m[0] === "[newpage]") {
      html += "<newpage>";
    } // 画像・ページジャンプは捨てる
  }
  html += escapeText(text.slice(last));
  return html.replace(/\r\n|\r|\n/g, "<br>");
};

const fetchEpisode = async (
  { baseUrl, fetchJson }: EpisodeContext,
  item: Pick<Subtitle, "href">,
) => {
  const id = novelIdFromHref(item.href);
  if (!id) throw new Error(`作品IDを取得できません: ${item.href}`);
  const body = getBody(await fetchJson(`${baseUrl}/ajax/novel/${id}?lang=ja`));
  return {
    url: `${baseUrl}${novelPath(id)}`,
    body: pixivTextToHtml(String(body["content"] ?? "")),
    introduction: "",
    postscript: "",
  };
};

const createSeriesToc = async (
  { basedir, fetchJson, sleep }: TocContext,
  id: string,
): Promise<Toc> => {
  const info = getBody(await fetchJson(`${basedir}/ajax/novel/series/${id}?lang=ja`));
  const toc: Toc = {
    title: String(info["title"] ?? ""),
    author: String(info["userName"] ?? ""),
    toc_url: `${basedir}/novel/series/${id}`,
    story: htmlToPlain(String(info["caption"] ?? info["extraData"]?.["meta"]?.["description"] ?? "")),
    subtitles: [],
  };
  const total = Number(info["total"] ?? info["publishedContentCount"] ?? Infinity);

  for (let page = 0; page < MAX_SERIES_PAGES; page++) {
    const lastOrder = page * SERIES_PAGE_SIZE;
    if (lastOrder >= total) break;
    if (page > 0) await sleep(100);
    const res = getBody(
      await fetchJson(
        `${basedir}/ajax/novel/series_content/${id}?limit=${SERIES_PAGE_SIZE}&last_order=${lastOrder}&order_by=asc&lang=ja`,
      ),
    );
    const contents = (res["page"]?.["seriesContents"] ?? []) as Json[];
    if (contents.length === 0) break;
    for (const content of contents) {
      if (content["available"] === false) continue; // 非公開・削除済み
      const subdate = toIso(content["uploadTimestamp"]);
      const subupdate = toIso(content["reuploadTimestamp"]);
      toc.subtitles.push({
        subtitle: String(content["title"] ?? ""),
        href: novelPath(String(content["id"])),
        // 話の並び替え・削除に強いよう、連番ではなく作品IDをキーにする
        index: String(content["id"]),
        ...(subdate && { subdate }),
        ...(subupdate && { subupdate }),
      });
    }
  }
  return toc;
};

const createNovelToc = async ({ basedir, fetchJson }: TocContext, id: string): Promise<Toc> => {
  const body = getBody(await fetchJson(`${basedir}/ajax/novel/${id}?lang=ja`));
  const subdate = typeof body["createDate"] === "string" ? body["createDate"] : undefined;
  const subupdate = typeof body["uploadDate"] === "string" ? body["uploadDate"] : undefined;
  return {
    title: String(body["title"] ?? ""),
    author: String(body["userName"] ?? ""),
    toc_url: `${basedir}${novelPath(id)}`,
    story: htmlToPlain(String(body["description"] ?? "")),
    // 単独作品: 見出しなしの1話として扱う
    subtitles: [
      {
        subtitle: "",
        href: novelPath(id),
        index: id,
        ...(subdate && { subdate }),
        ...(subupdate && { subupdate }),
      },
    ],
  };
};

const createToc = async (context: TocContext): Promise<Toc> => {
  const parsed = parseCode(context.code);
  if (!parsed) {
    throw new Error(`作品コードの形式が正しくありません: ${context.code} (series-123 / novel-456)`);
  }
  return parsed.kind === "series"
    ? createSeriesToc(context, parsed.id)
    : createNovelToc(context, parsed.id);
};

export const pixivSite: ApiSiteAdapter = {
  id: "pixiv",
  appTitle: "to Aozora Text",
  codeLabel: "series-シリーズID / novel-作品ID",
  allowedOrigins: ["https://www.pixiv.net"],
  lockPageScroll: false,
  extractCode,
  getNovelUrl: (origin, code) => {
    const parsed = parseCode(code);
    if (!parsed) return origin;
    return parsed.kind === "series" ? `${origin}/novel/series/${parsed.id}` : `${origin}${novelPath(parsed.id)}`;
  },
  createToc,
  fetchEpisode,
};
