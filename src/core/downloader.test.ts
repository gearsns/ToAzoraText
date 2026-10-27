import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDir } from "../test-utils/memoryFs";
import { CANCEL, CancelController } from "./cancel";
import { NovelDownloader } from "./downloader";
import { NovelStorage } from "./storage";
import type { EpisodeData, Subtitle, Toc } from "./types";

const T0 = new Date("2024/06/01 00:00").getTime();

const makeToc = (subtitles: Subtitle[]): Toc => ({
  title: "題名",
  author: "作者",
  toc_url: "https://example.com/n1",
  story: "あらすじ",
  subtitles,
});

const episode = (n: number, extra: Partial<Subtitle> = {}): Subtitle => ({
  subtitle: `第${n}話`,
  href: `/n1/${n}/`,
  index: n,
  subdate: "2024/01/01 00:00",
  ...extra,
});

let root: MemoryDir;
let cancel: CancelController;
let fetchEpisode: ReturnType<typeof vi.fn<(item: Subtitle) => Promise<EpisodeData>>>;
let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
let cancellableSleep: ReturnType<typeof vi.fn<(s: number) => Promise<void>>>;
let showLoading: ReturnType<typeof vi.fn<(t: string) => void>>;
let downloader: NovelDownloader;

beforeEach(() => {
  root = new MemoryDir("", { now: T0 });
  cancel = new CancelController();
  cancel.begin();
  fetchEpisode = vi.fn(async (item) => ({
    url: `https://example.com${item.href}`,
    body: `<p>本文${item.index}</p>`,
    introduction: "",
    postscript: "<p>あとがき</p>",
  }));
  sleep = vi.fn(async () => {});
  cancellableSleep = vi.fn(async () => {});
  showLoading = vi.fn();
  downloader = new NovelDownloader({
    storage: new NovelStorage(async () => root),
    cancel,
    fetchEpisode,
    sleep,
    cancellableSleep,
    showLoading,
  });
});

describe("NovelDownloader.download", () => {
  it("title.json・各話JSON・青空文庫テキストを保存する", async () => {
    await downloader.download(makeToc([episode(1), episode(2)]), "n1");

    expect(root.listFiles()).toEqual([
      "CacheNovels/n1/n1.txt",
      "CacheNovels/n1/title.json",
      "CacheNovels/n1/本文/1.json",
      "CacheNovels/n1/本文/2.json",
    ]);
    expect(JSON.parse(root.readText("CacheNovels/n1/title.json") ?? "")).toEqual({
      title: "題名",
      author: "作者",
      page: 2,
    });
    const saved = JSON.parse(root.readText("CacheNovels/n1/本文/1.json") ?? "");
    expect(saved).toMatchObject({ index: 1, body: "本文1\n", postscript: "あとがき\n" });
    expect(root.readText("CacheNovels/n1/n1.txt")).toContain("本文1\n");
    expect(root.readText("CacheNovels/n1/n1.txt")).toContain("本文2\n");
  });

  it("各話の取得前に 500ms 待ち、進捗と完了を表示する", async () => {
    await downloader.download(makeToc([episode(1)]), "n1");
    expect(sleep).toHaveBeenCalledWith(500);
    expect(showLoading).toHaveBeenCalledWith("1:第1話");
    expect(showLoading).toHaveBeenLastCalledWith("題名:完了");
  });

  it("保存済みで更新が無い話は取得しない。全話スキップならテキストも作り直さない", async () => {
    const toc = makeToc([episode(1), episode(2)]);
    await downloader.download(toc, "n1");
    fetchEpisode.mockClear();
    root.putFile("CacheNovels/n1/n1.txt", "KEEP", T0);

    await downloader.download(makeToc([episode(1), episode(2)]), "n1");

    expect(fetchEpisode).not.toHaveBeenCalled();
    expect(root.readText("CacheNovels/n1/n1.txt")).toBe("KEEP");
  });

  it("改稿された話だけ取得し直し、テキストを再生成する", async () => {
    await downloader.download(makeToc([episode(1), episode(2)]), "n1");
    fetchEpisode.mockClear();

    await downloader.download(
      makeToc([episode(1), episode(2, { subupdate: "2024/07/01 00:00" })]),
      "n1",
    );

    expect(fetchEpisode).toHaveBeenCalledTimes(1);
    expect(fetchEpisode.mock.calls[0]?.[0]).toMatchObject({ index: 2 });
    expect(root.readText("CacheNovels/n1/n1.txt")).toContain("本文2\n");
  });

  it("新しい話が増えたら増分だけ取得する", async () => {
    await downloader.download(makeToc([episode(1)]), "n1");
    fetchEpisode.mockClear();

    await downloader.download(makeToc([episode(1), episode(2)]), "n1");

    expect(fetchEpisode).toHaveBeenCalledTimes(1);
    expect(fetchEpisode.mock.calls[0]?.[0]).toMatchObject({ index: 2 });
  });

  it("10話取得するごとに 5 秒の休憩を入れる", async () => {
    const toc = makeToc(Array.from({ length: 21 }, (_, i) => episode(i + 1)));
    await downloader.download(toc, "n1");
    expect(cancellableSleep).toHaveBeenCalledTimes(2);
    expect(cancellableSleep).toHaveBeenCalledWith(5);
  });

  it("開始時点でキャンセル済みなら何も取得せず CANCEL を投げる", async () => {
    cancel.cancel();
    await expect(downloader.download(makeToc([episode(1)]), "n1")).rejects.toBe(CANCEL);
    expect(fetchEpisode).not.toHaveBeenCalled();
  });

  it("取得中にキャンセルされたらそこで止まる", async () => {
    fetchEpisode.mockImplementation(async (item) => {
      cancel.cancel();
      return { url: "", body: `${item.index}`, introduction: "", postscript: "" };
    });
    await expect(downloader.download(makeToc([episode(1), episode(2)]), "n1")).rejects.toBe(CANCEL);
    expect(fetchEpisode).toHaveBeenCalledTimes(1);
  });

  it("取得エラーは伝播し、それまでに保存した話は残る", async () => {
    fetchEpisode.mockImplementation(async (item) => {
      if (item.index === 2) throw new Error("boom");
      return { url: "", body: "x", introduction: "", postscript: "" };
    });
    await expect(downloader.download(makeToc([episode(1), episode(2)]), "n1")).rejects.toThrow("boom");
    expect(root.exists("CacheNovels/n1/本文/1.json")).toBe(true);
    expect(root.exists("CacheNovels/n1/本文/2.json")).toBe(false);
  });
});
