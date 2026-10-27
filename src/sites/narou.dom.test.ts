import { describe, expect, it, vi } from "vitest";
import { getLastPageNumber, getSubtitles, narouSite, parseInfoTop } from "./narou";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

const listHtml = `
<div class="p-eplist">
  <div class="p-eplist__chapter-title">第一章 はじまり</div>
  <div class="p-eplist__sublist">
    <a class="p-eplist__subtitle" href="/n1234ab/1/">プロローグ</a>
    <div class="p-eplist__update">
      2024/01/02 03:04
      <span title="2024/02/03 04:05 改稿">改稿</span>
    </div>
  </div>
  <div class="p-eplist__sublist">
    <a class="p-eplist__subtitle" href="https://ncode.syosetu.com/n1234ab/2/"> 第一話 </a>
    <div class="p-eplist__update">
      2024/01/05 06:07
    </div>
  </div>
  <div class="p-eplist__chapter-title">第二章</div>
  <div class="p-eplist__sublist">
    <a class="p-eplist__subtitle" href="https://novel18.syosetu.com/n1234ab/3/">第二話</a>
  </div>
  <div class="p-eplist__sublist"><span>リンク無し</span></div>
</div>`;

describe("getSubtitles", () => {
  const subtitles = getSubtitles(parse(listHtml));

  it("リンクの無い行は飛ばす", () => {
    expect(subtitles).toHaveLength(3);
  });

  it("タイトル・パス・連番を取り出す (絶対URLは origin を落とす)", () => {
    expect(subtitles.map((s) => [s.subtitle, s.href, s.index])).toEqual([
      ["プロローグ", "/n1234ab/1/", "1"],
      ["第一話", "/n1234ab/2/", "2"],
      ["第二話", "/n1234ab/3/", "3"],
    ]);
  });

  it("公開日と改稿日を取り出す (改稿の注記は除く)", () => {
    expect(subtitles[0]).toMatchObject({ subdate: "2024/01/02 03:04", subupdate: "2024/02/03 04:05" });
    expect(subtitles[1]?.subdate).toBe("2024/01/05 06:07");
    expect(subtitles[1]?.subupdate).toBeUndefined();
    expect(subtitles[2]?.subdate).toBeUndefined();
  });

  it("章タイトルを後続の話に引き継ぐ", () => {
    expect(subtitles.map((s) => s.chapter)).toEqual(["第一章 はじまり", "第一章 はじまり", "第二章"]);
  });

  it("目次が無いページは空配列", () => {
    expect(getSubtitles(parse("<p>x</p>"))).toEqual([]);
  });
});

describe("parseInfoTop", () => {
  it("項目名と値を対応づける", () => {
    const doc = parse(`
      <dl>
        <dt class="p-infotop-data__title"> 作者名 </dt><dd class="p-infotop-data__value"> 著者 </dd>
        <dt class="p-infotop-data__title">あらすじ</dt><dd class="p-infotop-data__value">概要です</dd>
      </dl>`);
    expect(parseInfoTop(doc)).toEqual({ 作者名: "著者", あらすじ: "概要です" });
  });
});

describe("getLastPageNumber", () => {
  it("最終ページ番号を返す", () => {
    expect(getLastPageNumber(parse('<a class="c-pager__item--last" href="/n1/?p=7">last</a>'))).toBe(7);
  });

  it("番号が読めなければ 1、ページャが無ければ null", () => {
    expect(getLastPageNumber(parse('<a class="c-pager__item--last" href="/n1/">last</a>'))).toBe(1);
    expect(getLastPageNumber(parse("<p>none</p>"))).toBeNull();
  });
});

describe("narouSite.getBody", () => {
  it(".p-novel__body の outerHTML を連結する", () => {
    const doc = parse('<div class="p-novel__body">A</div><div class="p-novel__body">B</div><div>C</div>');
    expect(narouSite.getBody(doc)).toBe('<div class="p-novel__body">A</div><div class="p-novel__body">B</div>');
  });
});

describe("narouSite.createToc", () => {
  const BASE = "https://ncode.syosetu.com";
  const infoHtml = `
    <dt class="p-infotop-data__title">作者名</dt><dd class="p-infotop-data__value">著者</dd>
    <dt class="p-infotop-data__title">あらすじ</dt><dd class="p-infotop-data__value">概要</dd>
    <dt class="p-infotop-data__title">掲載日</dt><dd class="p-infotop-data__value">2024年01月02日 03時04分</dd>
    <dt class="p-infotop-data__title">最終更新日</dt><dd class="p-infotop-data__value">2024年02月03日 04時05分</dd>`;
  const episodeRow = (n: number) =>
    `<div class="p-eplist__sublist"><a class="p-eplist__subtitle" href="/n1234ab/${n}/">話${n}</a></div>`;

  const run = async (pages: Record<string, string>) => {
    const requested: string[] = [];
    const sleep = vi.fn(async () => {});
    const toc = await narouSite.createToc({
      basedir: BASE,
      code: "n1234ab",
      fetchJson: async () => ({}),
      sleep,
      fetchDocument: async (url) => {
        requested.push(url);
        const html = pages[url];
        if (html === undefined) throw new Error(`unexpected url ${url}`);
        return parse(html);
      },
    });
    return { toc, requested, sleep };
  };

  it("連載: 全ページを順に取得して話を連結する", async () => {
    const { toc, requested, sleep } = await run({
      [`${BASE}/novelview/infotop/ncode/n1234ab`]: infoHtml,
      [`${BASE}/n1234ab`]:
        `<h1 class="p-novel__title">題名</h1><div class="p-eplist">${episodeRow(1)}${episodeRow(2)}</div>` +
        '<a class="c-pager__item--last" href="/n1234ab/?p=3">最後</a>',
      [`${BASE}/n1234ab/?p=2`]: `<div class="p-eplist">${episodeRow(3)}</div>`,
      [`${BASE}/n1234ab/?p=3`]: `<div class="p-eplist">${episodeRow(4)}</div>`,
    });

    expect(toc).toMatchObject({ title: "題名", author: "著者", story: "概要", toc_url: `${BASE}/n1234ab` });
    expect(toc.subtitles.map((s) => s.index)).toEqual(["1", "2", "3", "4"]);
    expect(requested).toEqual([
      `${BASE}/novelview/infotop/ncode/n1234ab`,
      `${BASE}/n1234ab`,
      `${BASE}/n1234ab/?p=2`,
      `${BASE}/n1234ab/?p=3`,
    ]);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("連載だがページャが無い (1ページに収まる) 場合も話を取得できる", async () => {
    const { toc, requested } = await run({
      [`${BASE}/novelview/infotop/ncode/n1234ab`]: infoHtml,
      [`${BASE}/n1234ab`]: `<h1 class="p-novel__title">題名</h1><div class="p-eplist">${episodeRow(1)}</div>`,
    });
    expect(toc.subtitles).toHaveLength(1);
    expect(requested).toHaveLength(2);
  });

  it("短編: 目次が無く本文があれば、トップページ自体を1話として扱う", async () => {
    const { toc } = await run({
      [`${BASE}/novelview/infotop/ncode/n1234ab`]: infoHtml,
      [`${BASE}/n1234ab`]: '<h1 class="p-novel__title">短編</h1><div class="p-novel__body">本文</div>',
    });
    expect(toc.subtitles).toEqual([
      {
        subtitle: "",
        href: "/n1234ab",
        index: 1,
        subdate: "2024年01月02日 03時04分",
        subupdate: "2024年02月03日 04時05分",
      },
    ]);
  });

  it("作者・あらすじが取れなくても空文字にする (undefined を作らない)", async () => {
    const { toc } = await run({
      [`${BASE}/novelview/infotop/ncode/n1234ab`]: "<p>empty</p>",
      [`${BASE}/n1234ab`]: "<p>empty</p>",
    });
    expect(toc.author).toBe("");
    expect(toc.story).toBe("");
    expect(toc.title).toBe("");
    expect(toc.subtitles).toEqual([]);
  });
});
