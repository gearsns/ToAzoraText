# to 青空文庫テキスト Bookmarklet

**小説家になろう / カクヨム / pixiv 小説** の作品を取得し、**青空文庫形式のテキスト (.txt)** に変換して保存するブックマークレットです。

- サイトごとに別々のブックマークレットとしてビルドされます (なろう版にカクヨムのコードは含まれません)
- 取得した本文はブラウザ内 (OPFS) に保存され、**更新があった話だけ**を差分取得します
- サーバーは不要です。静的ファイルを GitHub Pages などに置くだけで動きます

## 目次

- [対応サイト](#対応サイト)
- [ビルド方法](#ビルド方法)
- [公開 (GitHub Pages)](#公開-github-pages)
- [ブックマークレットの登録](#ブックマークレットの登録)
- [使い方](#使い方)
  - [共通の操作](#共通の操作)
  - [小説家になろう](#小説家になろう)
  - [カクヨム](#カクヨム)
  - [pixiv](#pixiv)
- [トラブルシューティング](#トラブルシューティング)
- [開発](#開発)

## 対応サイト

| サイト | 実行できるページ | 作品コード |
| --- | --- | --- |
| 小説家になろう | `ncode.syosetu.com` / `novel18.syosetu.com` | ncode (例: `n1234ab`) |
| カクヨム | `kakuyomu.jp` | 作品ID (`/works/` の後ろの数字) |
| pixiv 小説 | `www.pixiv.net` | `series-123` / `novel-456` |

上記以外のサイトで実行しても何も起きません。

## ビルド方法

### 必要なもの

- Node.js (LTS 推奨) と npm

### 手順

```sh
npm install
npm run build
```

`dist/` に次のファイルが出力されます。

| ファイル | 内容 |
| --- | --- |
| `dist/narou.js` | なろう用ブックマークレット本体 (IIFE) |
| `dist/kakuyomu.js` | カクヨム用 |
| `dist/pixiv.js` | pixiv 用 |
| `dist/index.html` | ブックマークレット登録用ページ (`public/index.html` のコピー) |

### スクリプト一覧

| コマンド | 内容 |
| --- | --- |
| `npm run build` | `dist/` を掃除して 3 サイト分をすべてビルド |
| `npm run build:narou` | なろうのみビルド (`cross-env SITE_NAME=narou vite build`) |
| `npm run build:kakuyomu` | カクヨムのみビルド |
| `npm run build:pixiv` | pixiv のみビルド |
| `npm run clean` | `dist/` を削除 |
| `npm run preview` | `dist/` を `http://localhost:4173/` で配信して確認 |
| `npm run typecheck` | 型チェック (`tsc --noEmit`) |
| `npm test` / `npm run test:run` | Node 環境のユニットテスト (watch / 1回のみ) |
| `npm run test:dom` | jsdom 環境のテスト |
| `npm run test:all` | すべてのテスト |

### ビルドの仕組み

`vite.config.ts` が環境変数 `SITE_NAME` (`narou` / `kakuyomu` / `pixiv`) を読み、
`src/entries/<SITE_NAME>.ts` を Vite の lib モードで単体の IIFE にまとめます。
`SITE_NAME` を指定せずに `vite build` を直接実行するとエラーになるため、`npm run build*` を使ってください。

## 公開 (GitHub Pages)

ブックマークレット本体 (約 18KB) は URL 欄に直接入れるには大きいため、
**本体を Web に置き、ブックマークには「その script を読み込むだけ」の短い `javascript:` を登録**する方式です。

1. `npm run build` で作った `dist/` を、静的ホスティング (GitHub Pages など) に公開します
2. 公開先の `index.html` を開きます (例: `https://<user>.github.io/<repo>/`)

`index.html` は自分自身の URL を基準にブックマークレットを生成するので、リポジトリ名の変更やカスタムドメインにもそのまま追従します。
本体は毎回公開先から読み込まれるため、**更新してもブックマークの再登録は不要**です。

## ブックマークレットの登録

1. 公開先の `index.html` を開く
2. 使いたいサイトのカードを探す (なろう / カクヨム / pixiv)
3. 青いリンクを**ブックマークバーへドラッグ**する
   - ドラッグできない環境 (スマホなど) では「**URLをコピー**」を押し、新規ブックマークの URL 欄に貼り付ける
4. 対象サイトの小説ページを開き、登録したブックマークをクリックする

> 青いリンクはクリックしても動きません (ドラッグ用です)。

## 使い方

ブックマークを実行すると、ページ上に管理パネルが表示されます。

### 共通の操作

| ボタン | 動作 |
| --- | --- |
| **Add** | 作品を登録して全話を取得する。開いているページの URL から作品コードを自動入力します |
| **Update** | 登録済みの作品を更新する。**チェックした作品だけ**、何もチェックがなければ**すべて**が対象 |
| **Remove** | チェックした作品を削除する (確認ダイアログあり) |
| **Refresh** | 保存済み作品の一覧を読み直す |
| **×** | パネルを閉じる |

- 一覧のヘッダー「更新」のチェックボックスで**全選択**できます
- 一覧の **作品コード (ncode など) のリンクをクリック**すると、青空文庫形式の `.txt` をダウンロードできます
  - ファイル名は `[作者名]タイトル.txt`
- 一覧のタイトルをクリックすると作品ページを開きます
- Update で新しい話が見つかると、チェック欄に**現在の総話数**が表示されます
- 処理中の**スピナーをダブルクリック**すると中断できます
- 一覧は縦ホイールで横スクロールします
- 取得は更新のあった話だけです。サーバー負荷軽減のため、1話ごとに 0.5 秒、10話ごとに 5 秒の待機が入ります

### 小説家になろう

対象: `ncode.syosetu.com` / `novel18.syosetu.com` (R-18 はログイン・年齢確認済みのブラウザで)

1. 作品のページ (例: `https://ncode.syosetu.com/n1234ab/`) を開く
2. ブックマークをクリック → パネルが表示される
3. **Add** を押す (ncode が自動入力される)
4. **登録** を押す → 全話を取得してテキストを生成
5. 一覧の ncode リンクをクリックして `.txt` を保存

- 連載・短編のどちらにも対応します
- パネル表示中は広告が非表示になり、ページのスクロールが止まります (**×** で戻ります)

### カクヨム

対象: `kakuyomu.jp`

1. 作品トップ (例: `https://kakuyomu.jp/works/1234567890123456789`) を開く
2. ブックマークをクリック → **Add** → **登録**
3. 一覧の作品コードリンクから `.txt` を保存

- 作品コードは `/works/` の後ろの ID です。自動入力されない場合は ID を直接入力してください
- 目次は作品トップの `__NEXT_DATA__` から読み取ります。取得できない場合は、サイト側の構造変更の可能性があります

### pixiv

対象: `www.pixiv.net`

pixiv は HTML ではなく ajax API (JSON) から取得します。作品コードは次の形式です。

| 対象 | コード | ページ |
| --- | --- | --- |
| シリーズ | `series-123` | `https://www.pixiv.net/novel/series/123` |
| 単独作品 | `novel-456` | `https://www.pixiv.net/novel/show.php?id=456` |

1. シリーズページ、または作品ページを開く
2. ブックマークをクリック → **Add**
3. 自動入力されたコードを確認して **登録**
4. 一覧の作品コードリンクから `.txt` を保存

注意点:

- **シリーズ全体**が欲しいときは、シリーズに属する話のページからだと `novel-…` (その1話だけ) が入力されます。`series-…` に書き換えてください
- R-18 作品など、ログインが必要なものは**ログイン済みのブラウザ**で実行してください
- pixiv 独自記法 (`[[rb:漢字 > かんじ]]` のルビ、`[newpage]`、`[chapter:題]` など) は青空文庫形式に変換されます。画像・ジャンプ記法は出力されません

## トラブルシューティング

| 症状 | 原因と対処 |
| --- | --- |
| `ToAzoraText: failed to load script` と表示される | スクリプトを読み込めていません。公開先 URL が正しいか、対象サイトの **CSP (Content-Security-Policy)** が `github.io` を許可していない可能性があります |
| ブックマークを押しても何も起きない | 対象サイト以外のページで実行していないか確認してください (許可 origin 以外では何もしません) |
| `○○は既に登録されています。` | 同じコードが登録済みです。更新は **Update** を使ってください |
| 登録中にエラーが出る | 対象サイトの HTML / API の構造変更、ログイン未済、通信エラーなどが考えられます。コンソールのログも確認してください |
| 一覧が空 | **Refresh** を押してください。データはブラウザの OPFS に保存されるため、サイト (origin) ごと・ブラウザごとに別になります |
| 保存したデータを消したい | **Remove** で削除するか、ブラウザのサイトデータを削除してください |

## 開発

### 構成

```
src/
  entries/        ブックマークレットのエントリ (サイトごとに数行)
    narou.ts / kakuyomu.ts / pixiv.ts
  sites/          サイト固有の処理 (SiteAdapter を実装)
    types.ts        SiteAdapter (HtmlSiteAdapter / ApiSiteAdapter) / TocContext
    narou.ts        目次の解析、本文の取り出し、URL 判定
    kakuyomu.ts     __NEXT_DATA__ の解析、本文の取り出し、URL 判定
    pixiv.ts        ajax API の取得、pixiv 独自記法 → HTML、URL 判定
  core/           サイト共通の処理 (副作用は引数で注入)
    aozora.ts       HTML → 青空文庫テキスト変換
    aozoraWriter.ts 保存済みの話を連結して .txt を書き出す
    downloader.ts   差分取得・保存 (NovelDownloader)
    storage.ts      OPFS 上の小説キャッシュ操作 (NovelStorage)
    episode.ts      1話分の取得と 前書き/本文/後書き の分解
    http.ts         Cookie 付き fetch → Document / JSON
    cancel.ts       キャンセル制御・待機
    date.ts         更新判定
    fs.ts           OPFS のインターフェース
    bootstrap.ts    runBookmarklet(site): 起動と対象サイト判定
  ui/             パネル (Shadow DOM)
    template.ts / panel.css / panel.ts
  test-utils/
    memoryFs.ts     テスト用のインメモリ OPFS
public/index.html   ブックマークレット登録ページ (dist/ にコピーされる)
vite.config.ts      SITE_NAME に応じたビルド設定・テスト設定
```

### テスト

- `*.test.ts` … Node 環境。DOM を使わない純粋なロジック
- `*.dom.test.ts` … jsdom 環境。`Document` を解析する処理とパネルの UI 操作

共通処理は `fetch` / `sleep` / OPFS / 画面表示 / キャンセルを**引数で受け取る**設計で、
OPFS はテストでは `MemoryDir` (インメモリ) に差し替えます。

### 新しいサイトを追加するには

1. `src/sites/<name>.ts` に `SiteAdapter` を実装する (各話が HTML なら `HtmlSiteAdapter`、API なら `ApiSiteAdapter`)
2. `src/entries/<name>.ts` を追加する (`runBookmarklet(<name>Site)` を呼ぶだけ)
3. `vite.config.ts` の `SITE_NAMES` に名前を追加する
4. `package.json` に `build:<name>` を追加し、`build` にも連結する
5. `public/index.html` の `SITES` に 1 行追加する
6. `src/sites/types.ts` の `id` の型にも名前を追加する

## 注意

- 取得した作品の著作権は各作者に帰属します。**私的利用の範囲**で使い、各サイトの利用規約を守ってください
- サーバーに負荷をかけないよう、待機時間を短くする改造は避けてください
