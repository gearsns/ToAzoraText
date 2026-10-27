import type { Toc } from "../core/types";
import type { HtmlSiteAdapter, TocContext } from "./types";

/** HTML 文字列から __NEXT_DATA__ の script 内容 (JSON 文字列) を取り出す */
export const extractNextData = (html: string): string | null => {
  const regexp = /(<script[\s\S]*?>)([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = regexp.exec(html)) !== null) {
    if (/__NEXT_DATA__/.test(m[1] ?? "")) {
      return m[2] ?? null;
    }
  }
  return null;
};

interface ApolloRef {
  __ref: string;
}

// Apollo のキャッシュは構造が動的なので、この関数内に限って緩く扱う
type ApolloState = Record<string, any>;

/**
 * __NEXT_DATA__ の JSON から toc を埋める。
 * 構造が想定と違えば例外を投げる (途中まで埋めた状態で残る)。
 */
export const fillTocFromNextData = (toc: Toc, nextData: unknown, code: string): void => {
  const apolloState: ApolloState = (nextData as any)["props"]["pageProps"]["__APOLLO_STATE__"];
  const topWorkId: string = apolloState["ROOT_QUERY"][`work({"id":"${code}"})`]["__ref"];
  const topWork = apolloState[topWorkId];
  toc.title = topWork["title"];
  toc.author = apolloState[topWork["author"]["__ref"]]["activityName"];
  toc.story = `${topWork["catchphrase"]}\n${topWork["introduction"]}`;

  let chapter = "";
  let index = 0;
  for (const tableOfContent of topWork["tableOfContents"] as ApolloRef[]) {
    const sub = apolloState[tableOfContent["__ref"]];
    if (sub["chapter"]) {
      chapter = apolloState[sub["chapter"]["__ref"]]["title"];
    }
    for (const item of (sub["episodeUnions"] ?? []) as ApolloRef[]) {
      ++index;
      const episode = apolloState[item["__ref"]];
      toc.subtitles.push({
        subtitle: episode["title"],
        href: `/works/${code}/episodes/${episode["id"]}`,
        index,
        subdate: episode["publishedAt"],
        subupdate: "",
        chapter,
      });
    }
  }
};

const createToc = async ({ basedir, code, fetchDocument }: TocContext): Promise<Toc> => {
  const url = `${basedir}/works/${code}`;
  const topDocument = await fetchDocument(url);
  const scriptData = extractNextData(topDocument.body.innerHTML);
  const toc: Toc = { title: "", author: "", toc_url: url, story: "", subtitles: [] };
  if (scriptData) {
    try {
      fillTocFromNextData(toc, JSON.parse(scriptData), code);
    } catch (e) {
      console.log(e);
    }
  }
  return toc;
};

export const kakuyomuSite: HtmlSiteAdapter = {
  id: "kakuyomu",
  appTitle: "Kakuyomu to Aozora Text",
  codeLabel: "ID/アドレス",
  allowedOrigins: ["https://kakuyomu.jp"],
  lockPageScroll: false,
  extractCode: (url) =>
    url.match(/.*kakuyomu.jp\/works\/(?<ncode>[A-Za-z0-9]+)/)?.groups?.ncode ?? null,
  getNovelUrl: (_origin, code) => `https://kakuyomu.jp/works/${code}`,
  createToc,
  getBody: (doc) =>
    [...doc.querySelectorAll(".js-episode-body")].map((el) => el.innerHTML).join(""),
};
