import { describe, expect, it } from "vitest";
import { isEpisodeUpToDate, parseEpisodeDate } from "./date";

const local = (s: string) => new Date(s).getTime();

describe("parseEpisodeDate", () => {
  it("YYYY/MM/DD hh:mm 形式", () => {
    expect(parseEpisodeDate("2024/01/02 03:04").getTime()).toBe(local("2024/01/02 03:04"));
  });

  it("日本語区切り (年月日 時分) を解釈する", () => {
    expect(parseEpisodeDate("2024年01月02日 03時04分").getTime()).toBe(local("2024/01/02 03:04"));
  });

  it("ISO 8601 (カクヨム) は秒を分と取り違えず、タイムゾーンも反映する", () => {
    expect(parseEpisodeDate("2024-01-02T03:04:05Z").getTime()).toBe(Date.UTC(2024, 0, 2, 3, 4, 5));
    expect(parseEpisodeDate("2024-01-02T12:34:56+09:00").getTime()).toBe(Date.UTC(2024, 0, 2, 3, 34, 56));
  });

  it("秒付きのローカル表記でも 時:分 を正しく読む", () => {
    expect(parseEpisodeDate("2024/01/02 03:04:05").getTime()).toBe(local("2024/01/02 03:04"));
  });

  it("解釈できない文字列は Invalid Date", () => {
    expect(Number.isNaN(parseEpisodeDate("").getTime())).toBe(true);
    expect(Number.isNaN(parseEpisodeDate("不明").getTime())).toBe(true);
  });
});

describe("isEpisodeUpToDate (カクヨム形式)", () => {
  it("UTC の公開日と、その後のファイル更新時刻を正しく比較する", () => {
    const published = "2024-06-01T00:00:00Z";
    expect(isEpisodeUpToDate({ subdate: published }, Date.UTC(2024, 5, 1, 0, 0, 1))).toBe(true);
    expect(isEpisodeUpToDate({ subdate: published }, Date.UTC(2024, 4, 31, 23, 59, 59))).toBe(false);
  });
});

describe("isEpisodeUpToDate", () => {
  const fileTime = local("2024/06/01 00:00");

  it("話の公開日がファイル更新より古ければ最新(true)", () => {
    expect(isEpisodeUpToDate({ subdate: "2024/01/01 00:00" }, fileTime)).toBe(true);
  });

  it("改稿日があれば公開日より優先して比較する", () => {
    const episode = { subdate: "2024/01/01 00:00", subupdate: "2024/07/01 00:00" };
    expect(isEpisodeUpToDate(episode, fileTime)).toBe(false);
  });

  it("改稿日が空文字なら公開日で比較する", () => {
    expect(isEpisodeUpToDate({ subdate: "2024/01/01 00:00", subupdate: "" }, fileTime)).toBe(true);
  });

  it("話の更新のほうが新しければ最新ではない(false)", () => {
    expect(isEpisodeUpToDate({ subdate: "2024/07/01 00:00" }, fileTime)).toBe(false);
  });

  it("日付が不明なら再取得する(false)", () => {
    expect(isEpisodeUpToDate({}, fileTime)).toBe(false);
  });
});
