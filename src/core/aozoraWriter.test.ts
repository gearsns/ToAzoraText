import { beforeEach, describe, expect, it } from "vitest";
import { MemoryDir } from "../test-utils/memoryFs";
import { buildChapterHeader, buildHeader, buildSubtitleHeader, writeAozoraText } from "./aozoraWriter";
import { CANCEL, CancelController } from "./cancel";
import type { Toc } from "./types";

describe("見出し生成", () => {
  it("buildHeader: タイトル・作者・あらすじを制御文字エスケープして並べる", () => {
    expect(buildHeader({ title: "題《名》", author: "作者", story: "あらすじ" })).toBe(
      "題※［＃始め二重山括弧、1-1-52］名※［＃終わり二重山括弧、1-1-53］\n" +
        "作者\n" +
        "\n［＃区切り線］\nあらすじ\n［＃区切り線］\n\n",
    );
  });

  it("buildChapterHeader: 改ページ + 柱 + 大見出し", () => {
    expect(buildChapterHeader("題", "第一章")).toBe(
      "［＃改ページ］\n［＃ページの左右中央］\n［＃ここから柱］題 ［＃ここで柱終わり］\n" +
        "［＃３字下げ］［＃大見出し］第一章［＃大見出し終わり］\n［＃改ページ］\n",
    );
  });

  it("buildSubtitleHeader: 改ページ + 中見出し", () => {
    expect(buildSubtitleHeader("一話")).toBe(
      "\n［＃改ページ］\n\n［＃３字下げ］［＃中見出し］一話［＃中見出し終わり］\n\n",
    );
  });
});

describe("writeAozoraText", () => {
  let root: MemoryDir;
  let cancel: CancelController;
  const toc: Toc = {
    title: "題",
    author: "作者",
    toc_url: "u",
    story: "概要",
    subtitles: [
      { subtitle: "一話", href: "/1", index: 1, chapter: "第一章" },
      { subtitle: "二話", href: "/2", index: 2, chapter: "第一章" },
      { subtitle: "三話", href: "/3", index: 3, chapter: "第二章" },
    ],
  };

  beforeEach(() => {
    root = new MemoryDir();
    cancel = new CancelController();
    cancel.begin();
    root.putFile("body/1.json", JSON.stringify({ body: "本文1\n" }));
    root.putFile("body/2.json", JSON.stringify({ body: "本文2\n" }));
    root.putFile("body/3.json", JSON.stringify({ body: "本文3\n" }));
  });

  const run = async (target = toc) => {
    const out = await root.getFileHandle("out.txt", { create: true });
    const body = await root.getDirectoryHandle("body");
    await writeAozoraText(out, body, target, cancel);
    return root.readText("out.txt");
  };

  it("ヘッダ → 章見出し(章が変わるときだけ) → 各話見出し → 本文 の順で書く", async () => {
    expect(await run()).toBe(
      buildHeader(toc) +
        buildChapterHeader("題", "第一章") + buildSubtitleHeader("一話") + "本文1\n" +
        buildSubtitleHeader("二話") + "本文2\n" +
        buildChapterHeader("題", "第二章") + buildSubtitleHeader("三話") + "本文3\n",
    );
  });

  it("章が無い作品 (短編) は章見出しを出さない", async () => {
    const short: Toc = { ...toc, subtitles: [{ subtitle: "", href: "/1", index: 1 }] };
    expect(await run(short)).toBe(buildHeader(toc) + "本文1\n");
  });

  it("本文ファイルが無い話は見出しだけ書いて続行する", async () => {
    await root.removeEntry("body", { recursive: true });
    root.putFile("body/1.json", JSON.stringify({ body: "本文1\n" }));
    const text = await run();
    expect(text).toContain("本文1\n");
    expect(text).toContain(buildSubtitleHeader("二話"));
    expect(text).not.toContain("本文2");
  });

  it("キャンセルされたら CANCEL を投げ、それまでの内容でファイルは閉じる", async () => {
    cancel.cancel();
    await expect(run()).rejects.toBe(CANCEL);
    expect(root.readText("out.txt")).toBe(buildHeader(toc));
  });
});
