import { afterEach, describe, expect, it, vi } from "vitest";
import { extractNextData, fillTocFromNextData, kakuyomuSite } from "./kakuyomu";

const nextData = {
  props: {
    pageProps: {
      __APOLLO_STATE__: {
        ROOT_QUERY: { 'work({"id":"123"})': { __ref: "Work:123" } },
        "Work:123": {
          title: "題名",
          author: { __ref: "UserAccount:1" },
          catchphrase: "キャッチ",
          introduction: "紹介文",
          tableOfContents: [{ __ref: "TOC:1" }, { __ref: "TOC:2" }],
        },
        "UserAccount:1": { activityName: "作者名" },
        "TOC:1": {
          chapter: { __ref: "Chapter:1" },
          episodeUnions: [{ __ref: "Episode:a" }, { __ref: "Episode:b" }],
        },
        "TOC:2": { chapter: null, episodeUnions: [{ __ref: "Episode:c" }] },
        "Chapter:1": { title: "第一章" },
        "Episode:a": { id: "a", title: "一話", publishedAt: "2024-01-01T00:00:00Z" },
        "Episode:b": { id: "b", title: "二話", publishedAt: "2024-01-02T00:00:00Z" },
        "Episode:c": { id: "c", title: "三話", publishedAt: "2024-01-03T00:00:00Z" },
      },
    },
  },
};

const emptyToc = () => ({ title: "", author: "", toc_url: "u", story: "", subtitles: [] });
const fakeDocument = (bodyHtml: string) => ({ body: { innerHTML: bodyHtml } }) as unknown as Document;

describe("kakuyomuSite 基本情報", () => {
  it("許可 origin は kakuyomu.jp のみ", () => {
    expect(kakuyomuSite.allowedOrigins).toEqual(["https://kakuyomu.jp"]);
  });

  it("URL から作品IDを取り出す", () => {
    expect(kakuyomuSite.extractCode("https://kakuyomu.jp/works/1177354054880238297")).toBe("1177354054880238297");
    expect(kakuyomuSite.extractCode("https://kakuyomu.jp/works/abc123/episodes/999")).toBe("abc123");
  });

  it("作品ページ以外は null", () => {
    expect(kakuyomuSite.extractCode("https://kakuyomu.jp/")).toBeNull();
    expect(kakuyomuSite.extractCode("https://example.com/works/123")).toBeNull();
  });

  it("作品URLは origin に依らず kakuyomu.jp 固定", () => {
    expect(kakuyomuSite.getNovelUrl("https://kakuyomu.jp", "123")).toBe("https://kakuyomu.jp/works/123");
  });
});

describe("extractNextData", () => {
  it("他の script を飛ばして __NEXT_DATA__ の中身を返す", () => {
    const html =
      '<script src="a.js"></script><script>var x = 1;</script>' +
      '<script id="__NEXT_DATA__" type="application/json">{"a":1}</script>';
    expect(extractNextData(html)).toBe('{"a":1}');
  });

  it("無ければ null", () => {
    expect(extractNextData("<script>var x</script><p>hi</p>")).toBeNull();
    expect(extractNextData("")).toBeNull();
  });
});

describe("fillTocFromNextData", () => {
  it("タイトル・作者・あらすじ・各話を取り出す", () => {
    const toc = emptyToc();
    fillTocFromNextData(toc, nextData, "123");
    expect(toc.title).toBe("題名");
    expect(toc.author).toBe("作者名");
    expect(toc.story).toBe("キャッチ\n紹介文");
    expect(toc.subtitles).toEqual([
      { subtitle: "一話", href: "/works/123/episodes/a", index: 1, subdate: "2024-01-01T00:00:00Z", subupdate: "", chapter: "第一章" },
      { subtitle: "二話", href: "/works/123/episodes/b", index: 2, subdate: "2024-01-02T00:00:00Z", subupdate: "", chapter: "第一章" },
      // chapter が無い TOC では直前の章を引き継ぐ
      { subtitle: "三話", href: "/works/123/episodes/c", index: 3, subdate: "2024-01-03T00:00:00Z", subupdate: "", chapter: "第一章" },
    ]);
  });

  it("構造が想定と違えば例外を投げる", () => {
    expect(() => fillTocFromNextData(emptyToc(), {}, "123")).toThrow();
  });

  it("別の作品IDなら例外 (ROOT_QUERY に無い)", () => {
    expect(() => fillTocFromNextData(emptyToc(), nextData, "999")).toThrow();
  });
});

describe("kakuyomuSite.createToc", () => {
  afterEach(() => vi.restoreAllMocks());

  it("作品ページを取得して目次を作る", async () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
    const fetchDocument = vi.fn(async () => fakeDocument(html));
    const toc = await kakuyomuSite.createToc({
      basedir: "https://kakuyomu.jp",
      code: "123",
      fetchDocument,
      fetchJson: async () => ({}),
      sleep: async () => {},
    });
    expect(fetchDocument).toHaveBeenCalledWith("https://kakuyomu.jp/works/123");
    expect(toc.toc_url).toBe("https://kakuyomu.jp/works/123");
    expect(toc.title).toBe("題名");
    expect(toc.subtitles).toHaveLength(3);
  });

  it("__NEXT_DATA__ が壊れていても例外にせず、空の目次を返す", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const toc = await kakuyomuSite.createToc({
      basedir: "https://kakuyomu.jp",
      code: "123",
      fetchDocument: async () => fakeDocument('<script id="__NEXT_DATA__">{broken</script>'),
      fetchJson: async () => ({}),
      sleep: async () => {},
    });
    expect(toc.title).toBe("");
    expect(toc.subtitles).toEqual([]);
    expect(log).toHaveBeenCalled();
  });
});
