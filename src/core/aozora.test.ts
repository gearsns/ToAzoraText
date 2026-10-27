import { describe, expect, it } from "vitest";
import { escapeAozoraTag, toAozora } from "./aozora";

describe("escapeAozoraTag", () => {
  it("青空文庫の制御文字をすべて代替表記へ置き換える", () => {
    expect(escapeAozoraTag("《》［］〔〕｜＃※")).toBe(
      [
        "※［＃始め二重山括弧、1-1-52］",
        "※［＃終わり二重山括弧、1-1-53］",
        "※［＃始め角括弧、1-1-46］",
        "※［＃終わり角括弧、1-1-47］",
        "※［＃始めきっこう（亀甲）括弧、1-1-44］",
        "※［＃終わりきっこう（亀甲）括弧、1-1-45］",
        "※［＃縦線、1-1-35］",
        "※［＃井げた、1-1-84］",
        "※［＃米印、1-2-8］",
      ].join(""),
    );
  });

  it("制御文字を含まない文字列はそのまま返す", () => {
    expect(escapeAozoraTag("普通の文章。abc123")).toBe("普通の文章。abc123");
  });

  it("何度呼んでも結果が安定する (グローバル正規表現の lastIndex を持ち越さない)", () => {
    expect(escapeAozoraTag("《")).toBe(escapeAozoraTag("《"));
    expect(escapeAozoraTag("※")).toBe("※［＃米印、1-2-8］");
  });
});

describe("toAozora", () => {
  it("改行コードは除去し、<br> を改行、</p> を行末にする", () => {
    expect(toAozora("a\r\nb")).toBe("ab");
    expect(toAozora("a<br>b<br/>c")).toBe("a\nb\nc");
    expect(toAozora("<p>一行目</p><p>二行目</p>")).toBe("一行目\n二行目\n");
  });

  it("ルビを青空文庫形式 ｜親文字《ルビ》 にする", () => {
    expect(toAozora("<ruby>漢字<rt>かんじ</rt></ruby>")).toBe("｜漢字《かんじ》");
    expect(toAozora("<ruby><rb>漢字</rb><rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>")).toBe(
      "｜漢字《かんじ》",
    );
  });

  it("rt が無い ruby は親文字だけにする", () => {
    expect(toAozora("<ruby>漢字</ruby>")).toBe("漢字");
  });

  it("本文中の制御文字はエスケープされ、ルビ記法とは混ざらない", () => {
    expect(toAozora("《注》<ruby>字<rt>じ</rt></ruby>")).toBe(
      "※［＃始め二重山括弧、1-1-52］注※［＃終わり二重山括弧、1-1-53］｜字《じ》",
    );
  });

  it("太字・斜体・取消線・傍点を注記に変換する", () => {
    expect(toAozora("<b>太</b>")).toBe("［＃太字］太［＃太字終わり］");
    expect(toAozora("<i>斜</i>")).toBe("［＃斜体］斜［＃斜体終わり］");
    expect(toAozora("<s>消</s>")).toBe("［＃取消線］消［＃取消線終わり］");
    expect(toAozora('<em class="emphasisDots">点</em>')).toBe("［＃傍点］点［＃傍点終わり］");
  });

  it("その他のタグは除去する", () => {
    expect(toAozora('<div class="x"><span>本文</span></div>')).toBe("本文");
  });

  it("主要な HTML エンティティを文字に戻す", () => {
    expect(toAozora("&lt;tag&gt; &quot;q&quot; &#39;s&#39; a&nbsp;b &copy;")).toBe(
      "<tag> \"q\" 's' a b (c)",
    );
  });

  it("エンティティは二重にデコードしない (&amp;lt; は &lt; になる)", () => {
    expect(toAozora("&amp;lt;")).toBe("&lt;");
    expect(toAozora("&amp;amp;")).toBe("&amp;");
    expect(toAozora("&amp;quot;")).toBe("&quot;");
  });

  it("未知のエンティティはそのまま残す", () => {
    expect(toAozora("&unknown; &")).toBe("&unknown; &");
  });

  it("空文字は空文字", () => {
    expect(toAozora("")).toBe("");
  });
});

describe("toAozora: アダプタ用の独自タグ", () => {
  it("<newpage> を改ページにする", () => {
    expect(toAozora("前<newpage>後")).toBe("前\n［＃改ページ］\n後");
  });
  it("<heading> を中見出しにする", () => {
    expect(toAozora("<heading>章</heading>")).toBe("\n［＃３字下げ］［＃中見出し］章［＃中見出し終わり］\n");
  });
});
