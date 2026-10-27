/** 目次の1話分 */
export interface Subtitle {
  subtitle: string;
  /** origin からの相対パス (例: /n1234ab/1/) */
  href: string;
  /** 保存ファイル名 (`${index}.json`) に使う。なろうは文字列、カクヨムは連番 */
  index: string | number;
  /** 公開日 */
  subdate?: string;
  /** 改稿日 */
  subupdate?: string;
  chapter?: string;
  /** 取得済みの本文 (青空文庫形式) */
  body?: string;
  postscript?: string;
}

export interface Toc {
  title: string;
  author: string;
  toc_url: string;
  story: string;
  subtitles: Subtitle[];
}

/** 一覧表示用 (title.json から復元) */
export interface NovelListItem {
  id: string;
  ncode: string;
  page: number;
  title: string;
  author: string;
}

/** 1話分の取得結果 */
export interface EpisodeData {
  url: string;
  body: string;
  introduction: string;
  postscript: string;
}

/** title.json の中身 */
export interface NovelInfo {
  title: string;
  author: string;
  page: number;
}
