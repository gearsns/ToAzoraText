import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/** ビルド対象サイト。src/entries/<name>.ts が対応するエントリ */
export const SITE_NAMES = ["narou", "kakuyomu", "pixiv"] as const;
export type SiteName = (typeof SITE_NAMES)[number];

const isSiteName = (value: string | undefined): value is SiteName =>
  SITE_NAMES.includes(value as SiteName);

const entryPath = (site: SiteName) =>
  fileURLToPath(new URL(`./src/entries/${site}.ts`, import.meta.url));

export default defineConfig(({ command }) => {
  const requested = process.env.SITE_NAME;
  if (command === "build" && !isSiteName(requested)) {
    throw new Error(
      `SITE_NAME に ${SITE_NAMES.join(" / ")} のいずれかを指定してください (現在: ${requested ?? "未指定"})\n` +
        `例: cross-env SITE_NAME=narou vite build`,
    );
  }
  // vitest では未指定でも動くようにする
  const site: SiteName = isSiteName(requested) ? requested : "narou";

  return {
    build: {
      // サイトごとのビルドを同じ dist/ に積み上げる (dist/narou.js, dist/kakuyomu.js, dist/pixiv.js, dist/index.html)。
      // 事前の掃除は `npm run clean` (build スクリプト内で実行) が担当する。
      outDir: "dist",
      emptyOutDir: false,
      // ブックマークレットから <script> で読み込む単体の IIFE を出力する
      lib: {
        entry: entryPath(site),
        name: `ToAzoraText_${site}`,
        formats: ["iife" as const],
        fileName: () => `${site}.js`,
      },
    },
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "node-unit",
            environment: "node",
            include: ["src/**/*.test.ts"],
            exclude: ["src/**/*.dom.test.ts"],
          },
        },
        {
          extends: true,
          test: {
            name: "dom-unit",
            environment: "jsdom",
            environmentOptions: { jsdom: { url: "https://ncode.syosetu.com/" } },
            include: ["src/**/*.dom.test.ts"],
          },
        },
      ],
    },
  };
});
