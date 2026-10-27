import { describe, expect, it, vi } from "vitest";
import { CancelController } from "./cancel";
import { createDocumentFetcher, createJsonFetcher } from "./http";

const fakeDoc = { fake: true } as unknown as Document;
const okResponse = (text: string) => ({ text: async () => text }) as Response;

describe("createDocumentFetcher", () => {
  it("Cookie 付きで取得し、本文を parse した Document を返す", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => okResponse("<p>hi</p>"));
    const parseHtml = vi.fn(() => fakeDoc);
    const fetchDocument = createDocumentFetcher({ cancel: new CancelController(), fetchFn, parseHtml });

    await expect(fetchDocument("https://example.com/a")).resolves.toBe(fakeDoc);
    expect(fetchFn).toHaveBeenCalledWith("https://example.com/a", { credentials: "include" });
    expect(parseHtml).toHaveBeenCalledWith("<p>hi</p>");
  });

  it("処理中(begin 済み)なら AbortSignal を渡す", async () => {
    const cancel = new CancelController();
    cancel.begin();
    const fetchFn = vi.fn<typeof fetch>(async () => okResponse(""));
    await createDocumentFetcher({ cancel, fetchFn, parseHtml: () => fakeDoc })("u");
    expect(fetchFn.mock.calls[0]?.[1]?.signal).toBe(cancel.signal);
  });

  it("通信のたびに onBeforeFetch を呼ぶ", async () => {
    const onBeforeFetch = vi.fn();
    const fetchDocument = createDocumentFetcher({
      cancel: new CancelController(),
      onBeforeFetch,
      fetchFn: async () => okResponse(""),
      parseHtml: () => fakeDoc,
    });
    await fetchDocument("a");
    await fetchDocument("b");
    expect(onBeforeFetch).toHaveBeenCalledTimes(2);
  });

  it("通信エラーはそのまま伝播する", async () => {
    const fetchDocument = createDocumentFetcher({
      cancel: new CancelController(),
      fetchFn: async () => {
        throw new TypeError("network");
      },
      parseHtml: () => fakeDoc,
    });
    await expect(fetchDocument("u")).rejects.toThrow("network");
  });
});

describe("createJsonFetcher", () => {
  it("Cookie 付きで取得し、JSON を返す", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => okResponse('{"a":1}'));
    const onBeforeFetch = vi.fn();
    const fetchJson = createJsonFetcher({ cancel: new CancelController(), fetchFn, onBeforeFetch });
    await expect(fetchJson("https://example.com/api")).resolves.toEqual({ a: 1 });
    expect(fetchFn).toHaveBeenCalledWith("https://example.com/api", { credentials: "include" });
    expect(onBeforeFetch).toHaveBeenCalledTimes(1);
  });

  it("処理中なら AbortSignal を渡す", async () => {
    const cancel = new CancelController();
    cancel.begin();
    const fetchFn = vi.fn<typeof fetch>(async () => okResponse("{}"));
    await createJsonFetcher({ cancel, fetchFn })("u");
    expect(fetchFn.mock.calls[0]?.[1]?.signal).toBe(cancel.signal);
  });

  it("JSON でなければ例外 (ログイン画面の HTML など)", async () => {
    const fetchJson = createJsonFetcher({ cancel: new CancelController(), fetchFn: async () => okResponse("<html>") });
    await expect(fetchJson("u")).rejects.toThrow("JSON");
  });
});
