import type { CancelController } from "./cancel";

export type FetchDocument = (url: string) => Promise<Document>;
export type FetchJson = (url: string) => Promise<unknown>;

export interface DocumentFetcherDeps {
  cancel: CancelController;
  /** 通信前に呼ばれる (エラーメッセージのクリア等) */
  onBeforeFetch?: () => void;
  fetchFn?: typeof fetch;
  parseHtml?: (html: string) => Document;
}

const defaultParse = (html: string): Document =>
  new DOMParser().parseFromString(html, "text/html");

/** Cookie 付きで取得した HTML を Document にして返す関数を作る */
export const createDocumentFetcher = ({
  cancel,
  onBeforeFetch,
  fetchFn = (...args) => fetch(...args),
  parseHtml = defaultParse,
}: DocumentFetcherDeps): FetchDocument =>
  async (url) => {
    onBeforeFetch?.();
    const options: RequestInit = { credentials: "include" };
    const signal = cancel.signal;
    if (signal) {
      options.signal = signal;
    }
    const html = await fetchFn(url, options).then((res) => res.text());
    return parseHtml(html);
  };

/** Cookie 付きで取得した JSON を返す関数を作る (pixiv など API を持つサイト向け) */
export const createJsonFetcher = ({
  cancel,
  onBeforeFetch,
  fetchFn = (...args) => fetch(...args),
}: Omit<DocumentFetcherDeps, "parseHtml">): FetchJson =>
  async (url) => {
    onBeforeFetch?.();
    const options: RequestInit = { credentials: "include" };
    const signal = cancel.signal;
    if (signal) {
      options.signal = signal;
    }
    const text = await fetchFn(url, options).then((res) => res.text());
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`JSON として解釈できません: ${url}`);
    }
  };
