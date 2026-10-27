import { TITLE_FILE_NAME, TOP_FOLDER_NAME } from "./constants";
import { getBrowserRoot, readJsonFile, type DirHandleLike } from "./fs";
import type { NovelInfo, NovelListItem } from "./types";

export class RemoveNovelError extends Error {
  readonly ncode: string;
  constructor(ncode: string, options?: ErrorOptions) {
    super(`${ncode} の削除に失敗しました`, options);
    this.name = "RemoveNovelError";
    this.ncode = ncode;
  }
}

/** OPFS 上の小説キャッシュ(CacheNovels/<ncode>/...)を扱う */
export class NovelStorage {
  private readonly getRoot: () => Promise<DirHandleLike>;
  private readonly topFolderName: string;

  constructor(getRoot: () => Promise<DirHandleLike> = getBrowserRoot, topFolderName = TOP_FOLDER_NAME) {
    this.getRoot = getRoot;
    this.topFolderName = topFolderName;
  }

  /** トップフォルダを取得 (無ければ作成) */
  async ensureTopDirectory(): Promise<DirHandleLike> {
    const root = await this.getRoot();
    return root.getDirectoryHandle(this.topFolderName, { create: true });
  }

  /** トップフォルダを取得 (無ければ null) */
  async findTopDirectory(): Promise<DirHandleLike | null> {
    try {
      const root = await this.getRoot();
      return await root.getDirectoryHandle(this.topFolderName, { create: false });
    } catch {
      return null;
    }
  }

  /** 保存済みの小説一覧 (ncode 昇順) */
  async listNovels(): Promise<NovelListItem[]> {
    const top = await this.findTopDirectory();
    if (!top) {
      return [];
    }
    const list: NovelListItem[] = [];
    for await (const entry of top.values()) {
      if (entry.kind !== "directory") continue;
      const info = await readJsonFile<Partial<NovelInfo>>(entry, TITLE_FILE_NAME);
      if (info) {
        list.push({
          id: entry.name,
          ncode: entry.name,
          page: info.page ?? 1,
          title: info.title ?? "",
          author: info.author ?? "",
        });
      }
    }
    return list.sort((a, b) => a.id.localeCompare(b.id));
  }

  /** 生成済みの青空文庫テキストを取得する */
  async getNovelTextFile(ncode: string): Promise<File> {
    const top = await this.ensureTopDirectory();
    const novelDir = await top.getDirectoryHandle(ncode, { create: false });
    const fileHandle = await novelDir.getFileHandle(`${ncode}.txt`, { create: false });
    return fileHandle.getFile();
  }

  /** 指定した小説を削除する。失敗したら RemoveNovelError */
  async removeNovels(ncodes: readonly string[], onProgress?: (ncode: string) => void): Promise<void> {
    const top = await this.ensureTopDirectory();
    for (const ncode of ncodes) {
      onProgress?.(ncode);
      try {
        await top.removeEntry(ncode, { recursive: true });
      } catch (cause) {
        throw new RemoveNovelError(ncode, { cause });
      }
    }
    await this.removeTopDirectoryIfEmpty();
  }

  /** トップフォルダが空なら削除する (空でなければ何もしない) */
  async removeTopDirectoryIfEmpty(): Promise<void> {
    try {
      const root = await this.getRoot();
      await root.removeEntry(this.topFolderName, { recursive: false });
    } catch {
      // 空でない/存在しない場合は無視
    }
  }
}
