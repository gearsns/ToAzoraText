import { beforeEach, describe, expect, it, vi } from "vitest";
import { NovelStorage } from "../core/storage";
import { MemoryDir } from "../test-utils/memoryFs";
import { mountPanel, type PanelHandle } from "../ui/panel";
import { pixivSite } from "./pixiv";

const BASE = "https://www.pixiv.net";

const ok = (body: unknown) => JSON.stringify({ error: false, message: "", body });
const entry = (id: number) => ({ id: String(id), title: `話${id}`, reuploadTimestamp: 1_700_000_000 });

let root: MemoryDir;
let handle: PanelHandle;
let responses: Record<string, string>;

const mount = async () => {
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    const text = responses[String(url)];
    if (text === undefined) throw new TypeError(`unexpected fetch: ${String(url)}`);
    return { text: async () => text } as Response;
  }) as unknown as typeof fetch;
  handle = mountPanel({
    site: pixivSite,
    storage: new NovelStorage(async () => root),
    fetchFn,
    sleep: async () => {},
    location: { origin: BASE, href: `${BASE}/novel/series/9` },
  });
  await handle.refresh();
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => handle.shadow.getElementById(id) as T;

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  root = new MemoryDir("", { now: new Date("2024/06/01 00:00").getTime() });
  vi.spyOn(console, "log").mockImplementation(() => {});
  responses = {
    [`${BASE}/ajax/novel/series/9?lang=ja`]: ok({ title: "シリーズ題", userName: "作者", caption: "概要", total: 2 }),
    [`${BASE}/ajax/novel/series_content/9?limit=20&last_order=0&order_by=asc&lang=ja`]: ok({
      page: { seriesContents: [entry(101), entry(102)] },
    }),
    [`${BASE}/ajax/novel/101?lang=ja`]: ok({ content: "[chapter:序]\n一話の本文[newpage]続き" }),
    [`${BASE}/ajax/novel/102?lang=ja`]: ok({ content: "[[rb:二話 > にわ]]の本文" }),
  };
});

describe("pixiv: パネルからシリーズを登録する", () => {
  it("各話を API から取得して、青空文庫テキストを生成する", async () => {
    await mount();
    $("AddNovel").click();
    expect($<HTMLInputElement>("NcodeInput").value).toBe("series-9"); // URL から補完
    $("SubmitNcode").click();
    await vi.waitFor(() => expect(root.exists("CacheNovels/series-9/series-9.txt")).toBe(true));
    await vi.waitFor(() => expect(handle.shadow.querySelectorAll(".NovelListItem")).toHaveLength(1));

    const text = await (await new NovelStorage(async () => root).getNovelTextFile("series-9")).text();
    expect(text).toContain("シリーズ題\n作者");
    expect(text).toContain("［＃中見出し］話101［＃中見出し終わり］");
    expect(text).toContain("一話の本文\n［＃改ページ］\n続き");
    expect(text).toContain("｜二話《にわ》の本文");
    expect($("AddError").textContent).toBe("");
  });

  it("作品コードの形式が違えば、エラーを表示して登録しない", async () => {
    await mount();
    $("AddNovel").click();
    $<HTMLInputElement>("NcodeInput").value = "9";
    $("SubmitNcode").click();
    await vi.waitFor(() => expect($("AddError").textContent).toContain("作品コードの形式"));
    expect(root.exists("CacheNovels/9")).toBe(false);
  });
});
