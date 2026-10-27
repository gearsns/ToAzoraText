import { describe, expect, it } from "vitest";
import { buildNovelRowsHtml, buildPanelHtml, buildSpacerRowHtml } from "./template";

describe("buildPanelHtml", () => {
  it("見出しと入力欄の呼び名をサイトごとに差し替える", () => {
    const html = buildPanelHtml({ appTitle: "Narou to Aozora Text", codeLabel: "ncode" });
    expect(html).toContain("<h1>Narou to Aozora Text</h1>");
    expect(html).toContain('<span id="InputCodeName">ncode</span>');
  });

  it("操作に必要な要素の id をすべて持つ", () => {
    const html = buildPanelHtml({ appTitle: "t", codeLabel: "c" });
    for (const id of [
      "container", "Main", "Close", "AddNovel", "UpdateNovel", "RemoveNovel", "ListRefresh",
      "NovelError", "ListBulkSelect", "NovelListData", "NovelAddModal", "AddError", "NcodeInput",
      "SubmitNcode", "CancelNcode", "NovelRemoveModal", "SubmitRemove", "CancelRemove",
      "Loading", "LoadingText",
    ]) {
      expect(html, id).toContain(`id="${id}"`);
    }
  });

  it("見出しは HTML エスケープする", () => {
    expect(buildPanelHtml({ appTitle: "<b>&", codeLabel: "c" })).toContain("<h1>&lt;b&gt;&amp;</h1>");
  });
});

describe("buildNovelRowsHtml", () => {
  const item = { id: "n1", ncode: "n1", page: 12, title: 'A "B" <C>', author: "作者&" };
  const url = (c: string) => `https://example.com/${c}/`;

  it("行ごとにコード・ページ数・タイトル・作者を出す", () => {
    const html = buildNovelRowsHtml([item], url);
    expect(html).toContain('ncode="n1"');
    expect(html).toContain('page="12"');
    expect(html).toContain('<div class="grid_td">12</div>');
    expect(html).toContain("href='https://example.com/n1/'");
    expect(html).toContain('download="[作者&amp;]A &quot;B&quot; &lt;C&gt;.txt"');
  });

  it("タイトル・作者は属性にも本文にもエスケープして埋め込む (XSS 対策)", () => {
    const html = buildNovelRowsHtml([item], url);
    expect(html).not.toContain("<C>");
    expect(html).toContain('title="A &quot;B&quot; &lt;C&gt;"');
  });

  it("空配列なら空文字", () => {
    expect(buildNovelRowsHtml([], url)).toBe("");
  });

  it("label が正しく閉じている", () => {
    const html = buildNovelRowsHtml([item], url);
    expect(html.match(/<label/g)?.length).toBe(html.match(/<\/label>/g)?.length);
  });
});

describe("buildSpacerRowHtml", () => {
  it("一番左(最小の --order)に置く余白行を作る", () => {
    expect(buildSpacerRowHtml(3)).toContain("--order: -3");
    expect(buildSpacerRowHtml(3)).toContain("grid_marged_cell");
  });
});
