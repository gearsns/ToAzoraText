import { escapeAozoraTag } from "./aozora";
import type { CancelController } from "./cancel";
import { readJsonFile, type DirHandleLike, type FileHandleLike } from "./fs";
import type { Subtitle, Toc } from "./types";

/** タイトル・作者・あらすじ部分 */
export const buildHeader = (toc: Pick<Toc, "title" | "author" | "story">): string =>
  `${escapeAozoraTag(toc.title)}\n` +
  `${escapeAozoraTag(toc.author)}\n` +
  `\n［＃区切り線］\n${escapeAozoraTag(toc.story)}\n［＃区切り線］\n\n`;

/** 章が変わるときの見出し */
export const buildChapterHeader = (novelTitle: string, chapter: string): string =>
  `［＃改ページ］\n［＃ページの左右中央］\n［＃ここから柱］${novelTitle} ［＃ここで柱終わり］\n` +
  `［＃３字下げ］［＃大見出し］${chapter}［＃大見出し終わり］\n［＃改ページ］\n`;

/** 各話の見出し */
export const buildSubtitleHeader = (subtitle: string): string =>
  `\n［＃改ページ］\n\n［＃３字下げ］［＃中見出し］${subtitle}［＃中見出し終わり］\n\n`;

/** 保存済みの各話JSONを連結して、1つの青空文庫テキストを書き出す */
export const writeAozoraText = async (
  outputFileHandle: FileHandleLike,
  bodyDirHandle: DirHandleLike,
  toc: Toc,
  cancel: CancelController,
): Promise<void> => {
  const writable = await outputFileHandle.createWritable();
  try {
    await writable.write(buildHeader(toc));
    let chapter: string | undefined = "";
    for (const item of toc.subtitles) {
      cancel.throwIfCancelled();
      const json = await readJsonFile<Pick<Subtitle, "body">>(bodyDirHandle, `${item.index}.json`);
      if (item.chapter && item.chapter !== chapter) {
        await writable.write(buildChapterHeader(toc.title, item.chapter));
      }
      if (item.subtitle) {
        await writable.write(buildSubtitleHeader(item.subtitle));
      }
      chapter = item.chapter;
      if (json?.body) {
        await writable.write(json.body);
      }
    }
  } finally {
    await writable.close();
  }
};
