import { escapeHtml } from "../core/html";
import type { NovelListItem } from "../core/types";

export interface PanelLabels {
  appTitle: string;
  codeLabel: string;
}

/** パネル全体の HTML (Shadow DOM の中身) */
export const buildPanelHtml = ({ appTitle, codeLabel }: PanelLabels): string => `
        <div id="container" class="NovelListBox">
            <div id="Main" class="NovelListInnerBox">
                <div class="MainInnerBox">
                    <div class="MainHeader">
                        <button id="Close">×</button><h1>${escapeHtml(appTitle)}</h1>
                        <div class="MainButtons">
                            <button id="AddNovel">Add</button>
                            <button id="UpdateNovel">Update</button>
                            <button id="RemoveNovel">Remove</button>
                            <button id="ListRefresh">Refresh</button>
                        </div>
                    </div>
                    <p id="NovelError"></p>
                    <div class="NovelTableWrap">
                        <div id="NovelListData" class="novel_grid">
                            <div class="grid_row header_row" style="--order: 9999">
                                <div class="grid_th"><input type="checkbox" id="ListBulkSelect"><label for="ListBulkSelect">更新</label></div>
                                <div class="grid_th">ncode</div>
                                <div class="grid_th">ページ</div>
                                <div class="grid_th"><span>タイトル</span><span>作者名</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="NovelAddModal" class="NovelListBox">
                <div class="NovelListInnerBox">
                    <p><span id="InputCodeName">${escapeHtml(codeLabel)}</span>を入力してください:</p>
                    <p id="AddError"></p>
                    <input type="text" id="NcodeInput" />
                    <button id="SubmitNcode">登録</button>
                    <button id="CancelNcode">キャンセル</button>
                </div>
            </div>
            <div id="NovelRemoveModal" class="NovelListBox">
                <div class="NovelListInnerBox">
                    <p>選択した小説を削除しますか？</p>
                    <button id="SubmitRemove">はい</button>
                    <button id="CancelRemove">いいえ</button>
                </div>
            </div>
            <div id="Loading" class="NovelListBox">
                <div class="NovelListInnerBox">
                    <p id="LoadingText">処理中</p>
                    <div class="spinner"></div>
                </div>
            </div>
        </div>
    `;

/** 一覧グリッドの行 (ヘッダー行の後ろに挿入する)。--order は新しい行ほど左に置くための値 */
export const buildNovelRowsHtml = (
  items: readonly NovelListItem[],
  getNovelUrl: (ncode: string) => string,
): string =>
  items
    .map(
      (item, index) =>
        `<div class="grid_row NovelListItem" style="--order: ${-index}" ncode="${escapeHtml(item.ncode)}" page="${item.page}" title="${escapeHtml(item.title)}">` +
        `<div class="grid_td"><input type="checkbox" class="NovelListNcode" value="${escapeHtml(item.ncode)}" id="NovelListItem_${escapeHtml(item.id)}">` +
        `<label for="NovelListItem_${escapeHtml(item.id)}"><span class="NovelListUpdateInfo"></span></label></div>` +
        `<div class="grid_td"><a class="NovelDownload" download="[${escapeHtml(item.author)}]${escapeHtml(item.title)}.txt">${escapeHtml(item.ncode)}</a></div>` +
        `<div class="grid_td">${item.page}</div>` +
        `<div class="grid_td"><a class="NovelTitle" href='${escapeHtml(getNovelUrl(item.ncode))}'>${escapeHtml(item.title)}</a><span class="NovelAuthor">${escapeHtml(item.author)}</span></div>` +
        `</div>`,
    )
    .join("");

/** 行の左端に置く空きスペース用の行。これが余白を吸収して一覧を右寄せにする */
export const buildSpacerRowHtml = (count: number): string =>
  `<div class="grid_row" style="--order: ${-count}"><div class="grid_marged_cell"></div></div>`;
