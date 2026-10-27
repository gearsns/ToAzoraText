import { describe, expect, it } from "vitest";
import { kakuyomuSite } from "../sites/kakuyomu";
import { narouSite } from "../sites/narou";
import { createEpisodeFetcher, extractAndRemoveByClass } from "./episode";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("extractAndRemoveByClass", () => {
  it("該当要素をすべて取り除き、その HTML を連結して返す (live collection を飛ばさない)", () => {
    const doc = parse('<div class="x">1</div><div class="x">2</div><div class="x">3</div><p>keep</p>');
    expect(extractAndRemoveByClass(doc, "x")).toBe(
      '<div class="x">1</div><div class="x">2</div><div class="x">3</div>',
    );
    expect(doc.querySelectorAll(".x")).toHaveLength(0);
    expect(doc.body.innerHTML).toBe("<p>keep</p>");
  });

  it("該当が無ければ空文字", () => {
    expect(extractAndRemoveByClass(parse("<p>a</p>"), "x")).toBe("");
  });
});

describe("createEpisodeFetcher", () => {
  const narouEpisode = `
    <h1 class="p-novel__subtitle-episode">話タイトル</h1>
    <div class="p-novel__subtitle-chapter">章</div>
    <div class="p-novel__body">
      <div class="p-novel__text p-novel__text--preface"><p>前書き</p></div>
      <div class="p-novel__text"><p>本文</p></div>
      <div class="p-novel__text p-novel__text--afterword"><p>後書き</p></div>
    </div>`;

  it("なろう: 前書き・後書きを分離し、本文からは取り除く", async () => {
    const urls: string[] = [];
    const fetchEpisode = createEpisodeFetcher({
      baseUrl: "https://ncode.syosetu.com",
      fetchDocument: async (url) => {
        urls.push(url);
        return parse(narouEpisode);
      },
      getBody: narouSite.getBody,
    });

    const data = await fetchEpisode({ href: "/n1234ab/1/" });

    expect(urls).toEqual(["https://ncode.syosetu.com/n1234ab/1/"]);
    expect(data.url).toBe("https://ncode.syosetu.com/n1234ab/1/");
    expect(data.introduction).toContain("前書き");
    expect(data.postscript).toContain("後書き");
    expect(data.body).toContain("本文");
    expect(data.body).not.toContain("前書き");
    expect(data.body).not.toContain("後書き");
  });

  it("カクヨム: 見出し要素を除き、本文は innerHTML を連結する", async () => {
    const fetchEpisode = createEpisodeFetcher({
      baseUrl: "https://kakuyomu.jp",
      fetchDocument: async () =>
        parse(
          '<p class="p-novel__subtitle-episode">題</p>' +
            '<div class="js-episode-body"><p>一段落</p></div><div class="js-episode-body"><p>二段落</p></div>',
        ),
      getBody: kakuyomuSite.getBody,
    });
    const data = await fetchEpisode({ href: "/works/1/episodes/2" });
    expect(data.url).toBe("https://kakuyomu.jp/works/1/episodes/2");
    expect(data.body).toBe("<p>一段落</p><p>二段落</p>");
    expect(data.introduction).toBe("");
    expect(data.postscript).toBe("");
  });
});
