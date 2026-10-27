import { describe, expect, it, vi } from "vitest";
import { CANCEL, CancelController, createCancellableSleep, isAbortError } from "./cancel";

describe("isAbortError", () => {
  it("cancel 文字列と AbortError を中断として扱う", () => {
    expect(isAbortError(CANCEL)).toBe(true);
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
  });

  it("それ以外は中断ではない", () => {
    expect(isAbortError(new Error("boom"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError("other")).toBe(false);
  });
});

describe("CancelController", () => {
  it("begin 前は signal なし・未中断で、throwIfCancelled は何も投げない", () => {
    const c = new CancelController();
    expect(c.signal).toBeUndefined();
    expect(c.aborted).toBe(false);
    expect(() => c.throwIfCancelled()).not.toThrow();
  });

  it("cancel すると aborted になり throwIfCancelled が CANCEL を投げる", () => {
    const c = new CancelController();
    c.begin();
    expect(c.aborted).toBe(false);
    c.cancel();
    expect(c.aborted).toBe(true);
    expect(c.signal?.reason).toBe(CANCEL);
    expect(() => c.throwIfCancelled()).toThrow(CANCEL);
  });

  it("end で進行中の処理を中断し、状態を初期化する", () => {
    const c = new CancelController();
    c.begin();
    const signal = c.signal;
    c.end();
    expect(signal?.aborted).toBe(true);
    expect(c.signal).toBeUndefined();
    expect(c.aborted).toBe(false);
  });

  it("begin し直すと新しい signal になる", () => {
    const c = new CancelController();
    c.begin();
    c.cancel();
    c.begin();
    expect(c.aborted).toBe(false);
  });
});

describe("createCancellableSleep", () => {
  it("N 秒指定で N+1 回、カウントダウン表示しながら 1 秒ずつ待つ", async () => {
    const cancel = new CancelController();
    cancel.begin();
    const showLoading = vi.fn();
    const sleep = vi.fn(async () => {});
    await createCancellableSleep({ cancel, showLoading, sleep })(2);
    expect(showLoading.mock.calls.map((c) => c[0])).toEqual(["待機中 2", "待機中 1", "待機中 0"]);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("待機中にキャンセルされたら CANCEL を投げて中断する", async () => {
    const cancel = new CancelController();
    cancel.begin();
    const sleep = vi.fn(async () => {
      if (sleep.mock.calls.length === 2) cancel.cancel();
    });
    const run = createCancellableSleep({ cancel, showLoading: () => {}, sleep })(5);
    await expect(run).rejects.toBe(CANCEL);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
