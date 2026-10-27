import { beforeEach, describe, expect, it, vi } from "vitest";
import { NovelStorage } from "../core/storage";
import { kakuyomuSite } from "../sites/kakuyomu";
import { narouSite } from "../sites/narou";
import type { SiteAdapter } from "../sites/types";
import { MemoryDir } from "../test-utils/memoryFs";
import { mountPanel, type PanelHandle } from "./panel";

const BASE = "https://ncode.syosetu.com";
const CODE = "n1234ab";

const infoHtml =
  '<dt class="p-infotop-data__title">作者名</dt><dd class="p-infotop-data__value">著者</dd>' +
  '<dt class="p-infotop-data__title">あらすじ</dt><dd class="p-infotop-data__value">概要</dd>';

const episodeBody = (n: number) =>
  `<div class="p-novel__body"><div class="p-novel__text"><p>本文${n}</p></div></div>`;

/** 連載 (n 話) を配信するサイトの擬似レスポンス */
const serialPages = (n: number): Record<string, string> => {
  const rows = Array.from(
    { length: n },
    (_, i) =>
      `<div class="p-eplist__sublist"><a class="p-eplist__subtitle" href="/${CODE}/${i + 1}/">話${i + 1}</a></div>`,
  ).join("");
  const pages: Record<string, string> = {
    [`${BASE}/novelview/infotop/ncode/${CODE}`]: infoHtml,
    [`${BASE}/${CODE}`]: `<h1 class="p-novel__title">題名</h1><div class="p-eplist">${rows}</div>`,
  };
  for (let i = 1; i <= n; i++) pages[`${BASE}/${CODE}/${i}/`] = episodeBody(i);
  return pages;
};

let root: MemoryDir;
let storage: NovelStorage;
let pages: Record<string, string>;
let handle: PanelHandle;
let saved: { anchor: HTMLAnchorElement; file: File }[];

const mount = async (site: SiteAdapter = narouSite) => {
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    const html = pages[String(url)];
    if (html === undefined) throw new TypeError(`unexpected fetch: ${String(url)}`);
    return { text: async () => html } as Response;
  }) as unknown as typeof fetch;
  handle = mountPanel({
    site,
    storage,
    fetchFn,
    sleep: async () => {},
    location: { origin: BASE, href: `${BASE}/${CODE}/` },
    saveFile: (anchor, file) => saved.push({ anchor, file }),
  });
  await handle.refresh();
  return handle;
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => handle.shadow.getElementById(id) as T;
const rows = () => [...handle.shadow.querySelectorAll<HTMLElement>(".NovelListItem")];
const text = (id: string) => $(id).textContent;

const addNovel = async (code = CODE) => {
  $("AddNovel").click();
  $<HTMLInputElement>("NcodeInput").value = code;
  $("SubmitNcode").click();
  await vi.waitFor(() => expect(root.exists(`CacheNovels/${code}/${code}.txt`)).toBe(true));
  await vi.waitFor(() => expect(rows().some((r) => r.getAttribute("ncode") === code)).toBe(true));
};

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("style");
  root = new MemoryDir("", { now: new Date("2024/06/01 00:00").getTime() });
  storage = new NovelStorage(async () => root);
  pages = serialPages(2);
  saved = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("マウント", () => {
  it("Shadow DOM にパネルを作り、サイト固有の見出しを出す", async () => {
    await mount();
    expect(document.getElementById("NovelListHost")).toBe(handle.host);
    expect(handle.shadow.querySelector("h1")?.textContent).toBe("to Aozora Text");
    expect(text("InputCodeName")).toBe("ncode");
  });

  it("もう一度実行しても要素が重複しない", async () => {
    await mount();
    await mount();
    expect(document.querySelectorAll("#NovelListHost")).toHaveLength(1);
    expect(handle.shadow.querySelectorAll("#container")).toHaveLength(1);
    expect(handle.shadow.querySelectorAll("style")).toHaveLength(1);
  });

  it("なろう: ページスクロールを止め、広告を隠す CSS を1つだけ追加する", async () => {
    await mount();
    await mount();
    expect(document.documentElement.style.overflowY).toBe("hidden");
    expect(document.querySelectorAll("#NovelListBaseStyle")).toHaveLength(1);
    expect(document.getElementById("NovelListBaseStyle")?.textContent).toContain("geniee_overlay_outer");
  });

  it("カクヨム: スクロール固定も広告CSSも行わない", async () => {
    await mount(kakuyomuSite);
    expect(handle.shadow.querySelector("h1")?.textContent).toBe("to Aozora Text");
    expect(text("InputCodeName")).toBe("ID/アドレス");
    expect(document.documentElement.style.overflowY).toBe("");
    expect(document.getElementById("NovelListBaseStyle")).toBeNull();
  });

  it("ローディングは完了後に隠れる", async () => {
    await mount();
    expect($("Loading").style.display).toBe("none");
  });
});

describe("一覧", () => {
  it("保存済みの小説を行として表示する", async () => {
    root.putFile("CacheNovels/n2/title.json", JSON.stringify({ title: "B作品", author: "乙", page: 4 }));
    root.putFile("CacheNovels/n1/title.json", JSON.stringify({ title: "A作品", author: "甲", page: 2 }));
    await mount();
    expect(rows().map((r) => r.getAttribute("ncode"))).toEqual(["n1", "n2"]);
    expect(rows()[0]?.textContent).toContain("A作品");
    expect(rows()[0]?.querySelector("a[href]")?.getAttribute("href")).toBe(`${BASE}/n1/`);
  });

  it("一括選択チェックで全行を切り替える", async () => {
    root.putFile("CacheNovels/n1/title.json", JSON.stringify({ title: "A", author: "a", page: 1 }));
    root.putFile("CacheNovels/n2/title.json", JSON.stringify({ title: "B", author: "b", page: 1 }));
    await mount();
    const bulk = $<HTMLInputElement>("ListBulkSelect");
    bulk.click();
    expect(handle.shadow.querySelectorAll(".NovelListNcode:checked")).toHaveLength(2);
    bulk.click();
    expect(handle.shadow.querySelectorAll(".NovelListNcode:checked")).toHaveLength(0);
  });
});

describe("Add (登録)", () => {
  it("開いている作品のURLから ncode を入力欄に補完する", async () => {
    await mount();
    $("AddNovel").click();
    expect($("NovelAddModal").style.display).toBe("block");
    expect($<HTMLInputElement>("NcodeInput").value).toBe(CODE);
  });

  it("キャンセルでモーダルを閉じる", async () => {
    await mount();
    $("AddNovel").click();
    $("CancelNcode").click();
    expect($("NovelAddModal").style.display).toBe("none");
  });

  it("未入力ならサイトごとの呼び名つきでエラーを出す", async () => {
    await mount();
    $("AddNovel").click();
    $<HTMLInputElement>("NcodeInput").value = "  ";
    $("SubmitNcode").click();
    expect(text("AddError")).toBe("ncodeが入力されていません。");
  });

  it("登録済みなら重複エラー", async () => {
    root.putFile(`CacheNovels/${CODE}/title.json`, JSON.stringify({ title: "T", author: "a", page: 1 }));
    await mount();
    $("AddNovel").click();
    $("SubmitNcode").click();
    expect(text("AddError")).toBe(`${CODE}は既に登録されています。`);
  });

  it("取得→保存→テキスト生成→一覧更新まで通しで動く", async () => {
    await mount();
    await addNovel();

    expect($("NovelAddModal").style.display).toBe("none");
    expect(JSON.parse(root.readText(`CacheNovels/${CODE}/title.json`) ?? "")).toEqual({
      title: "題名",
      author: "著者",
      page: 2,
    });
    const txt = root.readText(`CacheNovels/${CODE}/${CODE}.txt`) ?? "";
    expect(txt.startsWith("題名\n著者\n\n［＃区切り線］\n概要\n［＃区切り線］\n\n")).toBe(true);
    expect(txt).toContain("［＃中見出し］話1［＃中見出し終わり］");
    expect(txt).toContain("本文1\n");
    expect(txt).toContain("本文2\n");
    expect(rows()[0]?.textContent).toContain("題名");
    expect($("Loading").style.display).toBe("none");
  });

  it("通信に失敗したらエラーを表示してローディングを閉じる", async () => {
    pages = {};
    await mount();
    $("AddNovel").click();
    $("SubmitNcode").click();
    await vi.waitFor(() => expect(text("AddError")).toContain(`${CODE}の登録中にエラーが発生しました。`));
    expect($("Loading").style.display).toBe("none");
    expect($("NovelAddModal").style.display).toBe("block");
  });
});

describe("ダウンロードリンク", () => {
  it("クリックで保存済みテキストを saveFile に渡す", async () => {
    await mount();
    await addNovel();
    const link = handle.shadow.querySelector<HTMLAnchorElement>(".NovelDownload");
    link?.click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.file.name).toBe(`${CODE}.txt`);
    expect(saved[0]?.anchor.getAttribute("download")).toBe("[著者]題名.txt");
  });
});

describe("Update (更新)", () => {
  it("増えた話数をバッジで示し、新しい話を取得して保存する", async () => {
    await mount();
    await addNovel();
    expect(root.exists(`CacheNovels/${CODE}/本文/3.json`)).toBe(false);

    pages = serialPages(3);
    $("UpdateNovel").click();
    await vi.waitFor(() => expect(root.exists(`CacheNovels/${CODE}/本文/3.json`)).toBe(true));
    await vi.waitFor(() => expect($("Loading").style.display).toBe("none"));

    const badge = rows()[0]?.querySelector<HTMLElement>(".NovelListUpdateInfo");
    expect(badge?.textContent).toBe("3");
    expect(badge?.style.display).toBe("inline-block");
    expect(root.readText(`CacheNovels/${CODE}/${CODE}.txt`)).toContain("本文3\n");
  });

  it("通信エラー時はメッセージを出して処理を終える", async () => {
    await mount();
    await addNovel();
    pages = {};
    $("UpdateNovel").click();
    await vi.waitFor(() => expect(text("NovelError")).toBe("エラーが発生しました。"));
    expect($("Loading").style.display).toBe("none");
  });
});

describe("Remove (削除)", () => {
  beforeEach(async () => {
    root.putFile("CacheNovels/n1/title.json", JSON.stringify({ title: "A", author: "a", page: 1 }));
    root.putFile("CacheNovels/n2/title.json", JSON.stringify({ title: "B", author: "b", page: 1 }));
    await mount();
  });

  it("未選択ならメッセージを出し、確認モーダルは開かない", () => {
    $("RemoveNovel").click();
    expect(text("NovelError")).toBe("削除する小説を選択してください。");
    expect($("NovelRemoveModal").style.display).not.toBe("block");
  });

  it("選択した小説だけを確認後に削除し、一覧を更新する", async () => {
    rows()[0]?.querySelector<HTMLInputElement>(".NovelListNcode")?.click();
    $("RemoveNovel").click();
    expect($("NovelRemoveModal").style.display).toBe("block");
    $("SubmitRemove").click();

    await vi.waitFor(() => expect(text("NovelError")).toBe("小説を削除しました。"));
    expect(root.exists("CacheNovels/n1")).toBe(false);
    expect(root.exists("CacheNovels/n2")).toBe(true);
    expect(rows().map((r) => r.getAttribute("ncode"))).toEqual(["n2"]);
    expect($("NovelRemoveModal").style.display).toBe("none");
  });

  it("「いいえ」で閉じるだけで何も消さない", () => {
    rows()[0]?.querySelector<HTMLInputElement>(".NovelListNcode")?.click();
    $("RemoveNovel").click();
    $("CancelRemove").click();
    expect($("NovelRemoveModal").style.display).toBe("none");
    expect(root.exists("CacheNovels/n1")).toBe(true);
  });
});

describe("閉じる", () => {
  it("パネルを隠してページのスクロールを戻す", async () => {
    await mount();
    $("Close").click();
    expect($("container").style.display).toBe("none");
    expect(document.documentElement.style.overflowY).toBe("auto");
  });
});
