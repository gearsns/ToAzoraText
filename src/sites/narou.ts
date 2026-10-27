import type { Subtitle, Toc } from "../core/types";
import type { HtmlSiteAdapter, TocContext } from "./types";

/** 作品情報ページの「項目名 → 値」を集める */
export const parseInfoTop = (doc: Document): Record<string, string> => {
  const param: Record<string, string> = {};
  let key = "";
  for (const el of doc.querySelectorAll(".p-infotop-data__title, .p-infotop-data__value")) {
    if (el.classList.contains("p-infotop-data__title")) {
      key = el.textContent?.trim() ?? "";
    } else {
      param[key] = el.textContent?.trim() ?? "";
    }
  }
  return param;
};

/** 目次1ページ分から話一覧を取り出す */
export const getSubtitles = (doc: Document): Subtitle[] => {
  const subtitles: Subtitle[] = [];
  let chapter = "";
  for (const el of doc.querySelectorAll(
    ".p-eplist > .p-eplist__sublist, .p-eplist > .p-eplist__chapter-title",
  )) {
    if (!el.classList.contains("p-eplist__sublist")) {
      chapter = el.textContent?.trim() ?? ""; // 章タイトルを更新
      continue;
    }
    // サブタイトルとリンク
    const elSubtitle = el.querySelector(".p-eplist__subtitle");
    if (!elSubtitle) continue;
    const href = (elSubtitle.getAttribute("href") ?? "").replace(/https:\/\/.*\.syosetu\.com/, "");
    const item: Subtitle = {
      subtitle: elSubtitle.textContent?.trim() ?? "",
      href,
      index: href.replace(/\/.*\/(.*)\//, "$1"),
      chapter,
    };
    // 公開日と改稿日
    const elCreateDate = el.querySelector(".p-eplist__update");
    if (elCreateDate) {
      const elUpdateDate = elCreateDate.querySelector("span");
      if (elUpdateDate) {
        item.subupdate = (elUpdateDate.getAttribute("title") ?? "").replace(/ 改稿/, "");
      }
      item.subdate = (elCreateDate.textContent ?? "").trim().split(/\n/)[0] ?? "";
    }
    subtitles.push(item);
  }
  return subtitles;
};

/** 目次の最終ページ番号。ページャが無ければ null */
export const getLastPageNumber = (doc: Document): number | null => {
  const el = doc.querySelector(".c-pager__item--last");
  if (!el) return null;
  return parseInt((el.getAttribute("href") ?? "").match(/\?p=(\d+)/)?.[1] || "1", 10);
};

const createToc = async ({ basedir, code, fetchDocument, sleep }: TocContext): Promise<Toc> => {
  const param = parseInfoTop(await fetchDocument(`${basedir}/novelview/infotop/ncode/${code}`));
  const url = `${basedir}/${code}`;
  const topDocument = await fetchDocument(url);
  const toc: Toc = {
    title: topDocument.querySelector(".p-novel__title")?.textContent ?? "",
    author: param["作者名"] ?? "",
    toc_url: url,
    story: param["あらすじ"] ?? "",
    subtitles: getSubtitles(topDocument),
  };

  const lastPage = getLastPageNumber(topDocument);
  if (lastPage !== null) {
    // 2ページ目以降を取得
    for (let page = 2; page <= lastPage; page++) {
      await sleep(100);
      toc.subtitles.push(...getSubtitles(await fetchDocument(`${url}/?p=${page}`)));
    }
  } else if (toc.subtitles.length === 0 && topDocument.querySelector(".p-novel__body")) {
    // 短編: 目次が無く、トップページが本文
    const subupdate = param["最終更新日"] || param["最新掲載日"] || param["最終掲載日"];
    const subdate = param["掲載日"];
    toc.subtitles.push({
      subtitle: "",
      href: `/${code}`,
      index: 1,
      ...(subdate !== undefined && { subdate }),
      ...(subupdate !== undefined && { subupdate }),
    });
  }
  return toc;
};

export const narouSite: HtmlSiteAdapter = {
  id: "narou",
  appTitle: "Narou to Aozora Text",
  codeLabel: "ncode",
  allowedOrigins: ["https://ncode.syosetu.com", "https://novel18.syosetu.com"],
  lockPageScroll: true,
  pageCss: `
    ins, #geniee_overlay_outer, .c-ad {
        display: none !important;
    }
    `,
  extractCode: (url) => url.match(/.*syosetu.*\/(?<ncode>n[A-Za-z0-9]+)/)?.groups?.ncode ?? null,
  getNovelUrl: (origin, code) => `${origin}/${code}/`,
  createToc,
  getBody: (doc) =>
    [...doc.querySelectorAll(".p-novel__body")].map((el) => el.outerHTML).join(""),
};
