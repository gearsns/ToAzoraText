import type { DirHandleLike, FileHandleLike, WritableLike } from "../core/fs";

/** テスト用のインメモリ OPFS。実物の DirHandle と同じ振る舞い(存在しない→NotFoundError等)を再現する */
export interface Clock {
  now: number;
}

const notFound = (name: string) => new DOMException(`${name} が見つかりません`, "NotFoundError");

class MemoryFile {
  content: string;
  lastModified: number;
  constructor(content: string, lastModified: number) {
    this.content = content;
    this.lastModified = lastModified;
  }
}

class MemoryFileHandle implements FileHandleLike {
  readonly kind = "file" as const;
  readonly name: string;
  private readonly file: MemoryFile;
  private readonly clock: Clock;

  constructor(name: string, file: MemoryFile, clock: Clock) {
    this.name = name;
    this.file = file;
    this.clock = clock;
  }

  async getFile(): Promise<File> {
    return new File([this.file.content], this.name, { lastModified: this.file.lastModified });
  }

  async createWritable(): Promise<WritableLike> {
    let buffer = "";
    let closed = false;
    return {
      write: async (data: string) => {
        if (closed) throw new TypeError("closed");
        buffer += data;
      },
      close: async () => {
        if (closed) return;
        closed = true;
        this.file.content = buffer;
        this.file.lastModified = this.clock.now;
      },
    };
  }
}

export class MemoryDir implements DirHandleLike {
  readonly kind = "directory" as const;
  readonly name: string;
  readonly clock: Clock;
  private readonly dirs = new Map<string, MemoryDir>();
  private readonly files = new Map<string, MemoryFile>();

  constructor(name = "", clock: Clock = { now: Date.now() }) {
    this.name = name;
    this.clock = clock;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike> {
    if (this.dirs.has(name)) throw new DOMException(name, "TypeMismatchError");
    let file = this.files.get(name);
    if (!file) {
      if (!options?.create) throw notFound(name);
      file = new MemoryFile("", this.clock.now);
      this.files.set(name, file);
    }
    return new MemoryFileHandle(name, file, this.clock);
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandleLike> {
    if (this.files.has(name)) throw new DOMException(name, "TypeMismatchError");
    let dir = this.dirs.get(name);
    if (!dir) {
      if (!options?.create) throw notFound(name);
      dir = new MemoryDir(name, this.clock);
      this.dirs.set(name, dir);
    }
    return dir;
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.files.delete(name)) return;
    const dir = this.dirs.get(name);
    if (!dir) throw notFound(name);
    if (!options?.recursive && !dir.isEmpty()) {
      throw new DOMException(name, "InvalidModificationError");
    }
    this.dirs.delete(name);
  }

  async *values(): AsyncIterable<DirHandleLike | FileHandleLike> {
    for (const dir of [...this.dirs.values()]) yield dir;
    for (const [name, file] of [...this.files.entries()]) {
      yield new MemoryFileHandle(name, file, this.clock);
    }
  }

  isEmpty(): boolean {
    return this.dirs.size === 0 && this.files.size === 0;
  }

  // ---- テスト用の補助 ----

  /** "a/b/c.json" のようなパスにファイルを置く (途中のフォルダは自動作成) */
  putFile(path: string, content: string, lastModified: number = this.clock.now): void {
    const parts = path.split("/");
    const filename = parts.pop() as string;
    let dir: MemoryDir = this;
    for (const part of parts) {
      let next = dir.dirs.get(part);
      if (!next) {
        next = new MemoryDir(part, this.clock);
        dir.dirs.set(part, next);
      }
      dir = next;
    }
    dir.files.set(filename, new MemoryFile(content, lastModified));
  }

  /** ファイルの中身を読む。無ければ undefined */
  readText(path: string): string | undefined {
    const parts = path.split("/");
    const filename = parts.pop() as string;
    let dir: MemoryDir | undefined = this;
    for (const part of parts) {
      dir = dir?.dirs.get(part);
    }
    return dir?.files.get(filename)?.content;
  }

  /** ファイル/フォルダが存在するか */
  exists(path: string): boolean {
    const parts = path.split("/");
    const last = parts.pop() as string;
    let dir: MemoryDir | undefined = this;
    for (const part of parts) {
      dir = dir?.dirs.get(part);
    }
    return Boolean(dir && (dir.files.has(last) || dir.dirs.has(last)));
  }

  /** 全ファイルのパス一覧 (ソート済み) */
  listFiles(prefix = ""): string[] {
    const result: string[] = [];
    for (const name of this.files.keys()) result.push(`${prefix}${name}`);
    for (const [name, dir] of this.dirs) result.push(...dir.listFiles(`${prefix}${name}/`));
    return result.sort();
  }
}
