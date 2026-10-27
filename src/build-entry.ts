// ビルド専用のエントリ。vite-plugin-bookmarklet に `javascript:` URL を作らせるためだけに import する。
// 出力は vite.config.ts のプラグインが <site>.bookmarklet.txt として書き出す (この JS 自体は出力しない)。
import href from "#bookmarklet-entry?bookmarklet";

// 未使用の export は tree-shaking で消えるので、副作用として参照を残す
(globalThis as Record<string, unknown>)["__bookmarklet__"] = href;
