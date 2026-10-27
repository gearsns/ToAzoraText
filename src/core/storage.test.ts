import { beforeEach, describe, expect, it } from "vitest";
import { MemoryDir } from "../test-utils/memoryFs";
import { NovelStorage, RemoveNovelError } from "./storage";

let root: MemoryDir;
let storage: NovelStorage;

const putNovel = (ncode: string, info: object | null, extra: Record<string, string> = {}) => {
  if (info) root.putFile(`CacheNovels/${ncode}/title.json`, JSON.stringify(info));
  for (const [path, content] of Object.entries(extra)) {
    root.putFile(`CacheNovels/${ncode}/${path}`, content);
  }
};

beforeEach(() => {
  root = new MemoryDir();
  storage = new NovelStorage(async () => root);
});

describe("NovelStorage.top directory", () => {
  it("find は無ければ null、ensure は作成する", async () => {
    expect(await storage.findTopDirectory()).toBeNull();
    await storage.ensureTopDirectory();
    expect(await storage.findTopDirectory()).not.toBeNull();
    expect(root.exists("CacheNovels")).toBe(true);
  });
});

describe("NovelStorage.listNovels", () => {
  it("トップフォルダが無ければ空配列", async () => {
    expect(await storage.listNovels()).toEqual([]);
  });

  it("title.json を持つ小説だけを ncode 昇順で返す", async () => {
    putNovel("n2222bb", { title: "B", author: "作者B", page: 5 });
    putNovel("n1111aa", { title: "A", author: "作者A", page: 3 });
    putNovel("n9999zz", null, { "ゴミ.txt": "x" }); // title.json が無い
    root.putFile("CacheNovels/stray.txt", "x"); // フォルダではない

    expect(await storage.listNovels()).toEqual([
      { id: "n1111aa", ncode: "n1111aa", page: 3, title: "A", author: "作者A" },
      { id: "n2222bb", ncode: "n2222bb", page: 5, title: "B", author: "作者B" },
    ]);
  });

  it("page が無ければ 1 とする", async () => {
    putNovel("n1", { title: "T", author: "A" });
    expect((await storage.listNovels())[0]?.page).toBe(1);
  });
});

describe("NovelStorage.getNovelTextFile", () => {
  it("生成済みテキストを返す", async () => {
    putNovel("n1", { title: "T", author: "A", page: 1 }, { "n1.txt": "本文" });
    const file = await storage.getNovelTextFile("n1");
    expect(file.name).toBe("n1.txt");
  });

  it("未生成なら例外 (勝手にフォルダを作らない)", async () => {
    await expect(storage.getNovelTextFile("nope")).rejects.toThrow();
    expect(root.exists("CacheNovels/nope")).toBe(false);
  });
});

describe("NovelStorage.removeNovels", () => {
  it("指定した小説だけ削除し、進捗を通知する", async () => {
    putNovel("n1", { title: "1", author: "a", page: 1 }, { "本文/1.json": "{}" });
    putNovel("n2", { title: "2", author: "a", page: 1 });
    const progress: string[] = [];

    await storage.removeNovels(["n1"], (c) => progress.push(c));

    expect(progress).toEqual(["n1"]);
    expect(root.exists("CacheNovels/n1")).toBe(false);
    expect(root.exists("CacheNovels/n2")).toBe(true);
  });

  it("全部消えたらトップフォルダも削除する", async () => {
    putNovel("n1", { title: "1", author: "a", page: 1 });
    await storage.removeNovels(["n1"]);
    expect(root.exists("CacheNovels")).toBe(false);
  });

  it("存在しない小説の削除は RemoveNovelError (対象 ncode 付き)", async () => {
    putNovel("n1", { title: "1", author: "a", page: 1 });
    const error = await storage.removeNovels(["missing"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RemoveNovelError);
    expect((error as RemoveNovelError).ncode).toBe("missing");
    expect(root.exists("CacheNovels/n1")).toBe(true);
  });
});
