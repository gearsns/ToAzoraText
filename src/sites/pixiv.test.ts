import { describe, expect, it, vi } from "vitest";
import { toAozora } from "../core/aozora";
import { extractCode, htmlToPlain, parseCode, pixivSite, pixivTextToHtml } from "./pixiv";

const BASE = "https://www.pixiv.net";

describe("pixivSite 基本情報", () => {
  it("許可 origin は www.pixiv.net のみ", () => {
    expect(pixivSite.allowedOrigins).toEqual([BASE]);
  });

  it("URL から作品コードを取り出す", () => {
    expect(extractCode(`${BASE}/novel/series/123`)).toBe("series-123");
    expect(extractCode(`${BASE}/en/novel/series/123`)).toBe("series-123");
    expect(extractCode(`${BASE}/novel/show.php?id=456`)).toBe("novel-456");
    expect(extractCode(`${BASE}/novel/show.php?foo=1&id=456`)).toBe("novel-456");
  });

  it("小説ページ以外は null", () => {
    expect(extractCode(`${BASE}/`)).toBeNull();
    expect(extractCode(`${BASE}/artworks/789`)).toBeNull();
  });

  it("コードの解析と作品URL", () => {
    expect(parseCode("series-12")).toEqual({ kind: "series", id: "12" });
    expect(parseCode("novel-34")).toEqual({ kind: "novel", id: "34" });
    expect(parseCode("12")).toBeNull();
    expect(pixivSite.getNovelUrl(BASE, "series-12")).toBe(`${BASE}/novel/series/12`);
    expect(pixivSite.getNovelUrl(BASE, "novel-34")).toBe(`${BASE}/novel/show.php?id=34`);
  });
});

describe("pixivTextToHtml → toAozora", () => {
  const conv = (text: string) => toAozora(pixivTextToHtml(text));

  it("改行を保つ", () => {
    expect(conv("一行目\r\n二行目\n三行目")).toBe("一行目\n二行目\n三行目");
  });

  it("[[rb:]] をルビにする", () => {
    expect(conv("[[rb:漢字 > かんじ]]です")).toBe("｜漢字《かんじ》です");
  });

  it("[newpage] を改ページにする", () => {
    expect(conv("前[newpage]後")).toBe("前\n［＃改ページ］\n後");
  });

  it("[chapter:] を見出しにする", () => {
    expect(conv("[chapter:第一章]\n本文")).toContain("［＃３字下げ］［＃中見出し］第一章［＃中見出し終わり］");
  });

  it("画像・ページジャンプ記法は捨て、リンクは題だけ残す", () => {
    expect(conv("a[pixivimage:123]b[uploadedimage:9]c[jump:2]d")).toBe("abcd");
    expect(conv("[[jumpuri:公式 > https://example.com]]")).toBe("公式");
  });

  it("本文中の < & > は文字として残り、青空文庫の制御文字はエスケープされる", () => {
    expect(conv("1 < 2 & 3 > 2")).toBe("1 < 2 & 3 > 2");
    expect(conv("《注》")).toContain("※［＃始め二重山括弧、1-1-52］");
  });

  it("本文に書かれた HTML タグ風の文字列を要素として解釈しない", () => {
    expect(conv("<b>太字</b>と<newpage>")).toBe("<b>太字</b>と<newpage>");
  });
});

describe("htmlToPlain", () => {
  it("br を改行にし、タグを除き、実体参照を戻す", () => {
    expect(htmlToPlain("a<br />b<strong>c</strong>&amp;&#12354;")).toBe("a\nbc&あ");
  });
});

const ok = (body: unknown) => ({ error: false, message: "", body });

describe("pixivSite.createToc", () => {
  const ctx = (responses: Record<string, unknown>, code: string) => {
    const requested: string[] = [];
    const sleep = vi.fn(async () => {});
    return {
      requested,
      sleep,
      context: {
        basedir: BASE,
        code,
        sleep,
        fetchDocument: async () => ({}) as Document,
        fetchJson: async (url: string) => {
          requested.push(url);
          if (!(url in responses)) throw new Error(`unexpected: ${url}`);
          return responses[url];
        },
      },
    };
  };

  const content = (id: number) => ({
    id: String(id),
    title: `話${id}`,
    uploadTimestamp: 1700000000,
    reuploadTimestamp: 1700003600,
  });

  it("シリーズ: 20件ずつページングして全話を集める", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => content(i + 1));
    const page2 = [content(21), { ...content(22), available: false }, content(23)];
    const { context, requested } = ctx(
      {
        [`${BASE}/ajax/novel/series/9?lang=ja`]: ok({ title: "題", userName: "作者", caption: "あらすじ<br />二行目", total: 23 }),
        [`${BASE}/ajax/novel/series_content/9?limit=20&last_order=0&order_by=asc&lang=ja`]: ok({ page: { seriesContents: page1 } }),
        [`${BASE}/ajax/novel/series_content/9?limit=20&last_order=20&order_by=asc&lang=ja`]: ok({ page: { seriesContents: page2 } }),
      },
      "series-9",
    );
    const toc = await pixivSite.createToc(context);
    expect(requested).toHaveLength(3);
    expect(toc).toMatchObject({ title: "題", author: "作者", story: "あらすじ\n二行目", toc_url: `${BASE}/novel/series/9` });
    expect(toc.subtitles).toHaveLength(22); // available:false を除く
    expect(toc.subtitles[0]).toEqual({
      subtitle: "話1",
      href: "/novel/show.php?id=1",
      index: "1",
      subdate: new Date(1700000000 * 1000).toISOString(),
      subupdate: new Date(1700003600 * 1000).toISOString(),
    });
  });

  it("シリーズ: total が無くても空ページで止まる", async () => {
    const { context, requested } = ctx(
      {
        [`${BASE}/ajax/novel/series/9?lang=ja`]: ok({ title: "題", userName: "作者" }),
        [`${BASE}/ajax/novel/series_content/9?limit=20&last_order=0&order_by=asc&lang=ja`]: ok({ page: { seriesContents: [content(1)] } }),
        [`${BASE}/ajax/novel/series_content/9?limit=20&last_order=20&order_by=asc&lang=ja`]: ok({ page: { seriesContents: [] } }),
      },
      "series-9",
    );
    const toc = await pixivSite.createToc(context);
    expect(toc.subtitles).toHaveLength(1);
    expect(requested).toHaveLength(3);
  });

  it("単独作品: 見出しなしの1話にする", async () => {
    const { context } = ctx(
      {
        [`${BASE}/ajax/novel/5?lang=ja`]: ok({
          title: "短編", userName: "作者", description: "概要", createDate: "2024-01-01T00:00:00+09:00", uploadDate: "2024-01-02T00:00:00+09:00",
        }),
      },
      "novel-5",
    );
    const toc = await pixivSite.createToc(context);
    expect(toc.subtitles).toEqual([
      { subtitle: "", href: "/novel/show.php?id=5", index: "5", subdate: "2024-01-01T00:00:00+09:00", subupdate: "2024-01-02T00:00:00+09:00" },
    ]);
  });

  it("API が error を返したら例外", async () => {
    const { context } = ctx({ [`${BASE}/ajax/novel/series/9?lang=ja`]: { error: true, message: "not found", body: [] } }, "series-9");
    await expect(pixivSite.createToc(context)).rejects.toThrow("not found");
  });

  it("コードの形式が不正なら例外", async () => {
    const { context } = ctx({}, "n1234");
    await expect(pixivSite.createToc(context)).rejects.toThrow("作品コードの形式");
  });
});

describe("pixivSite.fetchEpisode", () => {
  it("API から本文を取り、toAozora 用の HTML にする", async () => {
    const fetchJson = vi.fn(async () => ok({ content: "[[rb:本 > ほん]]文\n二行目" }));
    const ep = await pixivSite.fetchEpisode(
      { baseUrl: BASE, fetchJson, fetchDocument: async () => ({}) as Document },
      { href: "/novel/show.php?id=77" },
    );
    expect(fetchJson).toHaveBeenCalledWith(`${BASE}/ajax/novel/77?lang=ja`);
    expect(ep.url).toBe(`${BASE}/novel/show.php?id=77`);
    expect(toAozora(ep.body)).toBe("｜本《ほん》文\n二行目");
  });

  it("href に ID が無ければ例外", async () => {
    await expect(
      pixivSite.fetchEpisode({ baseUrl: BASE, fetchJson: async () => ({}), fetchDocument: async () => ({}) as Document }, { href: "/x" }),
    ).rejects.toThrow("作品ID");
  });
});
