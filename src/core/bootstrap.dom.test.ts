import { beforeEach, describe, expect, it, vi } from "vitest";
import { kakuyomuSite } from "../sites/kakuyomu";
import { narouSite } from "../sites/narou";
import { MemoryDir } from "../test-utils/memoryFs";
import { runBookmarklet } from "./bootstrap";
import { NovelStorage } from "./storage";

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("style");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("runBookmarklet", () => {
  it("対象外のサイトでは何もしない (DOM も変更しない)", async () => {
    // jsdom の origin は https://ncode.syosetu.com なので、カクヨム用は対象外になる
    const handle = await runBookmarklet(kakuyomuSite);
    expect(handle).toBeNull();
    expect(document.getElementById("NovelListHost")).toBeNull();
  });

  it("対象サイトならパネルを表示し、保存済み一覧を読み込む", async () => {
    const root = new MemoryDir();
    root.putFile("CacheNovels/n1/title.json", JSON.stringify({ title: "作品", author: "作者", page: 3 }));
    const handle = await runBookmarklet(narouSite, { storage: new NovelStorage(async () => root) });

    expect(handle).not.toBeNull();
    expect(document.getElementById("NovelListHost")).toBe(handle?.host);
    expect(handle?.shadow.querySelectorAll(".NovelListItem")).toHaveLength(1);
  });
});
