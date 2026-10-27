import { writeAozoraText } from "./aozoraWriter";
import { toAozora } from "./aozora";
import type { CancelController } from "./cancel";
import { BODY_FOLDER_NAME, TITLE_FILE_NAME } from "./constants";
import { isEpisodeUpToDate } from "./date";
import { writeJsonFile, type DirHandleLike } from "./fs";
import type { NovelStorage } from "./storage";
import type { EpisodeData, NovelInfo, Subtitle, Toc } from "./types";

export interface DownloaderDeps {
  storage: NovelStorage;
  cancel: CancelController;
  fetchEpisode: (item: Subtitle) => Promise<EpisodeData>;
  sleep: (ms: number) => Promise<void>;
  /** N 秒待機 (キャンセル可能) */
  cancellableSleep: (seconds: number) => Promise<void>;
  showLoading: (text: string) => void;
  log?: (message: string) => void;
}

/** 保存済みファイルの最終更新日時(ms)。無ければ null */
const getLastModified = async (dir: DirHandleLike, filename: string): Promise<number | null> => {
  try {
    const handle = await dir.getFileHandle(filename, { create: false });
    return (await handle.getFile()).lastModified;
  } catch {
    return null;
  }
};

/** 目次をもとに各話を取得して保存し、青空文庫テキストを生成する */
export class NovelDownloader {
  private readonly deps: DownloaderDeps;

  constructor(deps: DownloaderDeps) {
    this.deps = deps;
  }

  /** 更新のあった話だけを取得して保存する。1話でも取得したら true */
  async writeEpisodeFiles(bodyDir: DirHandleLike, toc: Toc): Promise<boolean> {
    const { cancel, fetchEpisode, sleep, cancellableSleep, showLoading, log } = this.deps;
    let count = 0;
    for (const item of toc.subtitles) {
      const filename = `${item.index}.json`;
      const lastModified = await getLastModified(bodyDir, filename);
      if (lastModified !== null && isEpisodeUpToDate(item, lastModified)) {
        log?.(`Skip:${item.index}:${item.subtitle}`);
        continue;
      }
      showLoading(`${item.index}:${item.subtitle}`);
      cancel.throwIfCancelled();
      await sleep(500);
      const page = await fetchEpisode(item);
      item.body = toAozora(page.body);
      item.postscript = toAozora(page.postscript);
      await writeJsonFile(bodyDir, filename, item);
      ++count;
      if (count % 10 === 0) {
        log?.("Sleep");
        await cancellableSleep(5);
      }
    }
    return count > 0;
  }

  /** 1作品をダウンロードして保存する */
  async download(toc: Toc, ncode: string): Promise<void> {
    const { storage, cancel, showLoading } = this.deps;
    const top = await storage.ensureTopDirectory();
    const novelDir = await top.getDirectoryHandle(ncode, { create: true });
    const bodyDir = await novelDir.getDirectoryHandle(BODY_FOLDER_NAME, { create: true });
    const info: NovelInfo = { title: toc.title, author: toc.author, page: toc.subtitles.length };
    await writeJsonFile(novelDir, TITLE_FILE_NAME, info);
    cancel.throwIfCancelled();
    if (await this.writeEpisodeFiles(bodyDir, toc)) {
      showLoading(`${toc.title}:テキストファイル作成中…`);
      const fileHandle = await novelDir.getFileHandle(`${ncode}.txt`, { create: true });
      await writeAozoraText(fileHandle, bodyDir, toc, cancel);
    }
    showLoading(`${toc.title}:完了`);
  }
}
