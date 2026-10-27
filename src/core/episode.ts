import type { FetchDocument } from "./http";
import type { EpisodeData, Subtitle } from "./types";

/** 指定クラスの要素を取り除き、その outerHTML を連結して返す */
export const extractAndRemoveByClass = (doc: Document, className: string): string => {
  // getElementsByClassName は live collection なので、削除しながら回さないよう先に配列化する
  const elements = [...doc.getElementsByClassName(className)];
  const html = elements.map((el) => el.outerHTML);
  for (const el of elements) {
    el.parentNode?.removeChild(el);
  }
  return html.join("");
};

export interface EpisodeFetcherDeps {
  /** サイトの origin (例: https://ncode.syosetu.com) */
  baseUrl: string;
  fetchDocument: FetchDocument;
  /** サイトごとの本文抽出 */
  getBody: (doc: Document) => string;
}

/** 1話分のページを取得して、本文・前書き・後書きに分解する関数を作る */
export const createEpisodeFetcher =
  ({ baseUrl, fetchDocument, getBody }: EpisodeFetcherDeps) =>
  async (item: Pick<Subtitle, "href">): Promise<EpisodeData> => {
    const url = `${baseUrl}${item.href}`;
    const doc = await fetchDocument(url);
    const introduction = extractAndRemoveByClass(doc, "p-novel__text--preface");
    const postscript = extractAndRemoveByClass(doc, "p-novel__text--afterword");
    for (const el of doc.querySelectorAll(".p-novel__subtitle-chapter, .p-novel__subtitle-episode")) {
      el.parentNode?.removeChild(el);
    }
    return { url, body: getBody(doc), introduction, postscript };
  };
