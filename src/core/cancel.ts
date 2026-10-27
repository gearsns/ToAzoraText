/** キャンセル時に throw される値 */
export const CANCEL = "cancel";

export const isAbortError = (error: unknown): boolean =>
  error === CANCEL || (error as { name?: string } | null | undefined)?.name === "AbortError";

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 1回の処理(ローディング表示中)に紐づくキャンセル制御 */
export class CancelController {
  private controller: AbortController | null = null;

  /** 新しい処理を開始する */
  begin(): void {
    this.controller = new AbortController();
  }

  get signal(): AbortSignal | undefined {
    return this.controller?.signal;
  }

  get aborted(): boolean {
    return this.controller?.signal.aborted ?? false;
  }

  cancel(): void {
    try {
      this.controller?.abort(CANCEL);
    } catch {
      // abort 済み等は無視
    }
  }

  /** 処理を終了する (未完了のリクエストがあれば中断する) */
  end(): void {
    this.cancel();
    this.controller = null;
  }

  /** キャンセル済みなら CANCEL を throw する */
  throwIfCancelled(): void {
    if (this.aborted) {
      throw CANCEL;
    }
  }
}

export interface CancellableSleepDeps {
  cancel: CancelController;
  showLoading: (text: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

/** 「待機中 N」を表示しながら N+1 秒待つ。途中でキャンセルされたら CANCEL を throw する */
export const createCancellableSleep = ({
  cancel,
  showLoading,
  sleep: sleepFn = sleep,
}: CancellableSleepDeps) =>
  async (seconds: number): Promise<void> => {
    for (let i = seconds; i >= 0; --i) {
      cancel.throwIfCancelled();
      showLoading(`待機中 ${i}`);
      await sleepFn(1000);
    }
  };
