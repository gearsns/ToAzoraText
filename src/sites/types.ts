import type { FetchDocument, FetchJson } from "../core/http";
import type { EpisodeData, Subtitle, Toc } from "../core/types";

export interface TocContext {
  /** サイトの origin (例: https://ncode.syosetu.com) */
  basedir: string;
  /** 作品コード (ncode / カクヨムの作品ID) */
  code: string;
  fetchDocument: FetchDocument;
  /** JSON API を叩くサイト向け */
  fetchJson: FetchJson;
  sleep: (ms: number) => Promise<void>;
}

export interface EpisodeContext {
  /** サイトの origin */
  baseUrl: string;
  fetchDocument: FetchDocument;
  fetchJson: FetchJson;
}

/** サイトごとの差異を閉じ込めるインターフェース。共通処理はこれだけを見る */
interface SiteAdapterBase {
  readonly id: "narou" | "kakuyomu" | "pixiv";
  /** パネルの見出し */
  readonly appTitle: string;
  /** コード入力欄の呼び名 */
  readonly codeLabel: string;
  /** ブックマークレットを実行してよい origin */
  readonly allowedOrigins: readonly string[];
  /** パネル表示中、ページ本体のスクロールを止めるか */
  readonly lockPageScroll: boolean;
  /** ページ側に追加する CSS (広告の非表示など) */
  readonly pageCss?: string;

  /** URL から作品コードを取り出す。該当しなければ null */
  extractCode(url: string): string | null;
  /** 作品トップページの URL */
  getNovelUrl(origin: string, code: string): string;
  /** 目次を作成する */
  createToc(context: TocContext): Promise<Toc>;
}

/** 各話が HTML ページのサイト (なろう / カクヨム) */
export interface HtmlSiteAdapter extends SiteAdapterBase {
  /** 各話ページから本文 HTML を取り出す */
  getBody(doc: Document): string;
}

/** 各話を API から取得するサイト (pixiv) */
export interface ApiSiteAdapter extends SiteAdapterBase {
  /** 1話分を取得する。body は toAozora に渡せる HTML 形式で返す */
  fetchEpisode(context: EpisodeContext, item: Pick<Subtitle, "href">): Promise<EpisodeData>;
}

export type SiteAdapter = HtmlSiteAdapter | ApiSiteAdapter;
