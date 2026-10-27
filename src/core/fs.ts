/**
 * File System Access API (OPFS) のうち、このアプリが使う部分だけを切り出したインターフェース。
 * 実物の FileSystemDirectoryHandle と、テスト用のメモリ実装のどちらも満たせる。
 */
export interface WritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface FileHandleLike {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
}

export interface DirHandleLike {
  readonly kind: "directory";
  readonly name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandleLike>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterable<DirHandleLike | FileHandleLike>;
}

/** ブラウザの OPFS ルートを取得する */
export const getBrowserRoot = async (): Promise<DirHandleLike> =>
  (await navigator.storage.getDirectory()) as unknown as DirHandleLike;

/** JSON ファイルを読む。存在しない/壊れている場合は null */
export const readJsonFile = async <T = unknown>(
  dir: DirHandleLike,
  filename: string,
): Promise<T | null> => {
  try {
    const fileHandle = await dir.getFileHandle(filename, { create: false });
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
};

export const writeJsonFile = async (
  dir: DirHandleLike,
  filename: string,
  data: unknown,
): Promise<void> => {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data));
  await writable.close();
};
