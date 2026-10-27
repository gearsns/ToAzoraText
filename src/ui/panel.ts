import { CancelController, createCancellableSleep, isAbortError, sleep as defaultSleep } from "../core/cancel";
import { NovelDownloader } from "../core/downloader";
import { createEpisodeFetcher } from "../core/episode";
import { createDocumentFetcher, createJsonFetcher } from "../core/http";
import { RemoveNovelError, type NovelStorage } from "../core/storage";
import type { NovelListItem, Subtitle } from "../core/types";
import type { SiteAdapter } from "../sites/types";
import panelCss from "./panel.css?raw";
import { buildNovelRowsHtml, buildPanelHtml, buildSpacerRowHtml } from "./template";

const HOST_ID = "NovelListHost";
const BASE_STYLE_ID = "NovelListBaseStyle";

export interface PanelOptions {
  site: SiteAdapter;
  storage: NovelStorage;
  doc?: Document;
  location?: Pick<Location, "origin" | "href">;
  fetchFn?: typeof fetch;
  parseHtml?: (html: string) => Document;
  sleep?: (ms: number) => Promise<void>;
  /** 保存済みテキストをダウンロードさせる。省略時は a 要素のクリックで保存 */
  saveFile?: (anchor: HTMLAnchorElement, file: File) => void;
}

export interface PanelHandle {
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  /** 保存済み小説の一覧を読み直して表示する */
  refresh(): Promise<void>;
}

/** a 要素の複製に Blob URL を付けてクリックし、ブラウザの保存ダイアログを出す */
const saveViaAnchor = (doc: Document) => (anchor: HTMLAnchorElement, file: File) => {
  const a = anchor.cloneNode() as HTMLAnchorElement;
  const url = URL.createObjectURL(file);
  a.href = url;
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/** ページ上にパネルを組み立ててイベントを配線する */
export const mountPanel = (options: PanelOptions): PanelHandle => {
  const { site, storage } = options;
  const doc = options.doc ?? document;
  const loc = options.location ?? doc.location;
  const sleep = options.sleep ?? defaultSleep;
  const saveFile = options.saveFile ?? saveViaAnchor(doc);
  const topUrl = loc.origin;

  // ---- ホスト要素と Shadow DOM ----
  let host = doc.getElementById(HOST_ID);
  if (!host) {
    host = doc.createElement("div");
    host.id = HOST_ID;
    doc.body.appendChild(host);
  }
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  shadow.innerHTML = buildPanelHtml(site);
  const style = doc.createElement("style");
  style.textContent = panelCss;
  shadow.appendChild(style);

  if (site.lockPageScroll) {
    doc.documentElement.style.overflowY = "hidden";
  }
  doc.getElementById(BASE_STYLE_ID)?.remove();
  if (site.pageCss) {
    const baseStyle = doc.createElement("style");
    baseStyle.id = BASE_STYLE_ID;
    baseStyle.textContent = site.pageCss;
    doc.head.appendChild(baseStyle);
  }

  const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const el = shadow.getElementById(id);
    if (!el) throw new Error(`#${id} が見つかりません`);
    return el as T;
  };

  // ---- エラー表示 / ローディング ----
  const setErrorMessage = (text: string) => {
    $("NovelError").textContent = text;
  };
  const clearErrorMessage = () => setErrorMessage("");

  const cancel = new CancelController();
  const elLoading = $("Loading");
  const elLoadingText = $("LoadingText");
  let loadingVisible = false;

  const showLoading = (text: string) => {
    if (!loadingVisible) {
      loadingVisible = true;
      elLoading.style.display = "block";
      cancel.begin();
    }
    elLoadingText.textContent = text;
  };
  const hideLoading = () => {
    cancel.end();
    loadingVisible = false;
    elLoading.style.display = "none";
  };
  const cancelLoading = () => cancel.cancel();
  shadow.querySelector("#Loading .spinner")?.addEventListener("dblclick", cancelLoading);

  // ---- 取得・保存の部品 ----
  const fetchDocument = createDocumentFetcher({
    cancel,
    onBeforeFetch: clearErrorMessage,
    ...(options.fetchFn && { fetchFn: options.fetchFn }),
    ...(options.parseHtml && { parseHtml: options.parseHtml }),
  });
  const fetchJson = createJsonFetcher({
    cancel,
    onBeforeFetch: clearErrorMessage,
    ...(options.fetchFn && { fetchFn: options.fetchFn }),
  });
  const fetchEpisode =
    "fetchEpisode" in site
      ? (item: Subtitle) => site.fetchEpisode({ baseUrl: topUrl, fetchDocument, fetchJson }, item)
      : createEpisodeFetcher({ baseUrl: topUrl, fetchDocument, getBody: site.getBody });
  const cancellableSleep = createCancellableSleep({ cancel, showLoading, sleep });
  const downloader = new NovelDownloader({
    storage,
    cancel,
    fetchEpisode,
    sleep,
    cancellableSleep,
    showLoading,
    log: (message) => console.log(message),
  });
  const createToc = (code: string) =>
    site.createToc({ basedir: topUrl, code, fetchDocument, fetchJson, sleep });

  // ---- 一覧 ----
  let novelList: NovelListItem[] = [];
  const elNovelListData = $("NovelListData");
  const elTableWrap = elNovelListData.parentElement as HTMLElement;
  // 縦ホイールを横スクロールに変換 (ホイール下 = 左へ = 次の作品)
  elTableWrap.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      elTableWrap.scrollLeft -= e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    },
    { passive: false },
  );

  const refreshNovelList = async () => {
    showLoading("小説の一覧を取得しています...");
    try {
      clearErrorMessage();
      novelList = await storage.listNovels();
      // ヘッダー行は残し、その後ろの行だけ作り直す
      for (const el of elNovelListData.querySelectorAll(".header_row ~ *")) el.remove();
      elNovelListData.insertAdjacentHTML(
        "beforeend",
        buildNovelRowsHtml(novelList, (code) => site.getNovelUrl(topUrl, code)) +
          buildSpacerRowHtml(novelList.length),
      );
      for (const el of elNovelListData.querySelectorAll<HTMLAnchorElement>(".NovelDownload")) {
        el.addEventListener("click", async (e) => {
          e.preventDefault();
          try {
            saveFile(el, await storage.getNovelTextFile(el.textContent ?? ""));
          } catch (err) {
            console.log(err);
          }
        });
      }
    } finally {
      hideLoading();
    }
    // 先頭(ヘッダー)が右端なので、スクロール位置を右端に合わせる
    setTimeout(() => {
      elTableWrap.scrollLeft = elTableWrap.scrollWidth;
    }, 0);
  };

  const checkedRows = () =>
    [...shadow.querySelectorAll<HTMLElement>(".NovelListItem")].filter((row) =>
      row.querySelector(".NovelListNcode:checked"),
    );

  const closeModal = (e: Event, target: HTMLElement) => {
    if (e.target === target) {
      target.style.display = "none";
    }
  };

  // ---- 閉じる ----
  const elContainer = $("container");
  $("Close").addEventListener("click", () => {
    elContainer.style.display = "none";
    doc.documentElement.style.overflowY = "auto";
  });

  // ---- Add ----
  const elModalAdd = $("NovelAddModal");
  const elInput = $<HTMLInputElement>("NcodeInput");
  const elAddError = $("AddError");
  $("AddNovel").addEventListener("click", () => {
    elModalAdd.style.display = "block";
    elAddError.textContent = "";
    const code = site.extractCode(loc.href);
    if (code) {
      elInput.value = code;
    }
    elInput.focus();
  });
  elModalAdd.addEventListener("click", (e) => closeModal(e, elModalAdd));
  $("CancelNcode").addEventListener("click", () => {
    elModalAdd.style.display = "none";
  });
  $("SubmitNcode").addEventListener("click", async () => {
    const ncode = elInput.value.trim();
    if (!ncode) {
      elAddError.textContent = `${$("InputCodeName").textContent}が入力されていません。`;
      return;
    }
    if (novelList.some((e) => e.ncode === ncode)) {
      elAddError.textContent = `${ncode}は既に登録されています。`;
      return;
    }
    showLoading(`小説[${ncode}]を登録中...`);
    try {
      const toc = await createToc(ncode);
      await cancellableSleep(5);
      await downloader.download(toc, ncode);
      hideLoading();
      elModalAdd.style.display = "none";
      await refreshNovelList();
    } catch (error) {
      hideLoading();
      elAddError.textContent = isAbortError(error)
        ? "処理を中断しました。"
        : `${ncode}の登録中にエラーが発生しました。${error}`;
    }
  });

  // ---- Update ----
  $("UpdateNovel").addEventListener("click", async () => {
    clearErrorMessage();
    const checked = checkedRows();
    const rows = checked.length > 0 ? checked : [...shadow.querySelectorAll<HTMLElement>(".NovelListItem")];
    try {
      for (const row of rows) {
        showLoading(`${row.getAttribute("title")}\n情報を取得しています...`);
        const ncode = row.getAttribute("ncode") ?? "";
        const found = novelList.find((e) => e.ncode === ncode);
        const elUpdate = row.querySelector<HTMLElement>(".NovelListUpdateInfo");
        if (elUpdate) elUpdate.textContent = "";
        if (found) {
          const toc = await createToc(ncode);
          if (elUpdate && toc.subtitles.length - found.page > 0) {
            elUpdate.textContent = String(toc.subtitles.length);
            elUpdate.style.display = "inline-block";
          }
          await cancellableSleep(5);
          await downloader.download(toc, ncode);
        }
      }
    } catch (error) {
      setErrorMessage(isAbortError(error) ? "処理を中断しました。" : "エラーが発生しました。");
      console.log(error);
    }
    hideLoading();
  });

  // ---- Remove ----
  const elModalRemove = $("NovelRemoveModal");
  $("RemoveNovel").addEventListener("click", () => {
    clearErrorMessage();
    if (checkedRows().length > 0) {
      elModalRemove.style.display = "block";
    } else {
      setErrorMessage("削除する小説を選択してください。");
    }
  });
  elModalRemove.addEventListener("click", (e) => closeModal(e, elModalRemove));
  $("CancelRemove").addEventListener("click", () => {
    elModalRemove.style.display = "none";
  });
  $("SubmitRemove").addEventListener("click", async () => {
    clearErrorMessage();
    showLoading("一覧から小説を削除しています...");
    elModalRemove.style.display = "none";
    const ncodes = checkedRows().map((row) => row.getAttribute("ncode") ?? "");
    try {
      await storage.removeNovels(ncodes, (ncode) => {
        const title = novelList.find((e) => e.ncode === ncode)?.title ?? ncode;
        showLoading(`${title}\n一覧から小説を削除しています...`);
      });
    } catch (error) {
      hideLoading();
      setErrorMessage(
        error instanceof RemoveNovelError
          ? `${error.ncode}の削除中にエラーが発生しました。`
          : "削除中にエラーが発生しました。",
      );
      return;
    }
    hideLoading();
    await refreshNovelList();
    setErrorMessage("小説を削除しました。");
  });

  // ---- Refresh / 一括選択 ----
  $("ListRefresh").addEventListener("click", () => void refreshNovelList());
  const elBulkSelect = $<HTMLInputElement>("ListBulkSelect");
  elBulkSelect.addEventListener("click", () => {
    for (const el of shadow.querySelectorAll<HTMLInputElement>(".NovelListItem .NovelListNcode")) {
      el.checked = elBulkSelect.checked;
    }
  });

  return { host, shadow, refresh: refreshNovelList };
};
