# to 青空文庫テキスト Bookmarklet

小説家になろう / カクヨム / pixiv 小説の作品を取得し、青空文庫形式のテキストに変換するブックマークレット。
サイトごとに別々のブックマークレットとしてビルドします。

## 使い方

ブックマークレット本体 (約18KB) は GitHub Pages に置き、ブックマークには
「その script を読み込むだけ」の短い `javascript:` を登録します。

1. GitHub に push (`main`) すると GitHub Actions がビルドして Pages にデプロイします
2. デプロイ先 (`https://<user>.github.io/<repo>/`) の `index.html` を開きます
3. 表示されたリンクをブックマークバーへドラッグ、または「URLをコピー」して
   ブックマークの URL 欄に貼り付けます
4. 対象サイトの小説ページでブックマークを開きます

`index.html` は自分自身の URL を基準にブックマークレットを生成するので、リポジトリ名の変更や
カスタムドメインにもそのまま追従します。本体は毎回デプロイ先から読み込むため、
更新してもブックマークの再登録は不要です。

### 初回セットアップ

リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にしてください。

### ローカルでのビルド

```sh
npm install
npm run build              # dist/ に narou.js / kakuyomu.js / pixiv.js / index.html
npm run preview            # http://localhost:4173/ で index.html を確認
npm run build:narou        # cross-env SITE_NAME=narou vite build (単体)
```

出力は `dist/<site>.js` (IIFE) と `dist/index.html` (`public/index.html` のコピー) です。

### pixiv の作品コード

pixiv は HTML ではなく ajax API (JSON) から取得します。保存フォルダ名にもなる作品コードは次の形式です。

| 対象 | コード | ページ |
| --- | --- | --- |
| シリーズ | `series-123` | `https://www.pixiv.net/novel/series/123` |
| 単独作品 | `novel-456` | `https://www.pixiv.net/novel/show.php?id=456` |

Add を押すと、開いているページの URL からコードを自動入力します。シリーズに属する話のページを開いている場合は
`novel-…` (その1話だけ) になるので、シリーズ全体が欲しいときは `series-…` に書き換えてください。
R-18 作品などログインが必要なものは、ログイン済みのブラウザで実行してください。

### 注意

読み込みは `<script>` タグの挿入なので、対象サイトの CSP (Content-Security-Policy) が
`github.io` を許可していないとブロックされます。その場合は alert が出ます。

## テスト

```sh
npm test            # node-unit (watch)
npm run test:run    # node-unit (1回だけ)
npm run test:dom    # dom-unit (jsdom が必要なテスト)
npm run test:all    # 両方
npm run typecheck   # tsc --noEmit
```

- `*.test.ts` … Node 環境。DOM を使わない純粋なロジック。
- `*.dom.test.ts` … jsdom 環境。`Document` を解析する処理と、パネルの UI 操作。

## 構成

```
src/
  entries/        ブックマークレットのエントリ (サイトごとに数行)
    narou.ts
    kakuyomu.ts
    pixiv.ts
  sites/          サイト固有の処理だけ (SiteAdapter を実装)
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
    fs.ts           OPFS のインターフェース (テストでメモリ実装に差し替え)
    bootstrap.ts    runBookmarklet(site) : 起動と対象サイト判定
  ui/             パネル (Shadow DOM)
    template.ts     HTML 文字列の生成 (純粋関数)
    panel.css       スタイル
    panel.ts        イベント配線 (mountPanel)
  test-utils/
    memoryFs.ts     テスト用のインメモリ OPFS
  build-entry.ts  ビルド専用 (bookmarklet 文字列を作らせるだけ。JS は出力しない)
vite.config.ts    SITE_NAME に応じたビルド設定
legacy/           変換前の元ソース (参照用。不要なら削除可)
```

### ビルドの仕組み

`vite.config.ts` が `SITE_NAME` を読み、`src/entries/<SITE_NAME>.ts` を Vite の lib モードで
単体の IIFE (`dist/<SITE_NAME>.js`) にまとめます。サイトごとに別ビルドなので、
なろう版のバンドルにカクヨムのコードは含まれません (逆も同様)。
`index.html` が `<script src=".../<site>.js">` を挿入する `javascript:` URL を生成します。

### テストしやすくするための設計

- 共通処理は `fetch` / `sleep` / OPFS / 画面表示 / キャンセルを**引数で受け取る**。
- DOM を解析する関数は `Document` を受け取る純粋関数 (`getSubtitles`, `parseInfoTop` など)。
- OPFS は最小限のインターフェース (`DirHandleLike`) 越しに使い、テストでは `MemoryDir` に差し替える。

### 新しいサイトを追加するには

1. `src/sites/<name>.ts` に `SiteAdapter` を実装する (各話が HTML なら `HtmlSiteAdapter`、API なら `ApiSiteAdapter`)
2. `src/entries/<name>.ts` を追加する (`runBookmarklet(<name>Site)` を呼ぶだけ)
3. `vite.config.ts` の `SITE_NAMES` に名前を追加する
4. `package.json` に `build:<name>` を追加し、`build` にも連結する
5. `public/index.html` の `SITES` に1行追加する
