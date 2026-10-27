import { describe, expect, it } from "vitest";
import { narouSite } from "./narou";

describe("narouSite 基本情報", () => {
  it("許可 origin は ncode / novel18", () => {
    expect(narouSite.allowedOrigins).toEqual(["https://ncode.syosetu.com", "https://novel18.syosetu.com"]);
  });

  it("URL から ncode を取り出す", () => {
    expect(narouSite.extractCode("https://ncode.syosetu.com/n1234ab/")).toBe("n1234ab");
    expect(narouSite.extractCode("https://ncode.syosetu.com/n1234ab/12/")).toBe("n1234ab");
    expect(narouSite.extractCode("https://novel18.syosetu.com/n9999zz/")).toBe("n9999zz");
  });

  it("作品ページ以外は null", () => {
    expect(narouSite.extractCode("https://example.com/")).toBeNull();
    expect(narouSite.extractCode("https://syosetu.com/")).toBeNull();
  });

  it("作品URLは現在の origin を使う (R18 でも同じサブドメインのまま)", () => {
    expect(narouSite.getNovelUrl("https://ncode.syosetu.com", "n1234ab")).toBe("https://ncode.syosetu.com/n1234ab/");
    expect(narouSite.getNovelUrl("https://novel18.syosetu.com", "n1234ab")).toBe("https://novel18.syosetu.com/n1234ab/");
  });

  it("ページスクロール固定と広告非表示を行う", () => {
    expect(narouSite.lockPageScroll).toBe(true);
    expect(narouSite.pageCss).toContain("display: none !important");
  });
});
