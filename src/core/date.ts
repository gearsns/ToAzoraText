const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;
const LOCAL_DATE = /([0-9]{4})\D+([0-9]{2})\D+([0-9]{2})\D+([0-9]{2})\D+([0-9]{2})/;

/**
 * 公開日/改稿日の文字列を Date にする。
 * - ISO 8601 (2024-01-02T03:04:05Z など): タイムゾーンも含めてそのまま解釈する
 * - 「2024/01/02 03:04」「2024年01月02日 03時04分」: 日本時間(ブラウザのローカル時刻)として解釈する
 * 解釈できなければ Invalid Date。
 */
export const parseEpisodeDate = (text: string): Date => {
  if (ISO_DATE.test(text)) {
    return new Date(text);
  }
  const m = text.match(LOCAL_DATE);
  return m ? new Date(`${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}`) : new Date(Number.NaN);
};

/**
 * 保存済みファイルが話の最終更新より新しければ true (再取得不要)。
 * 日付が解釈できない場合は false (再取得する)。
 */
export const isEpisodeUpToDate = (
  episode: { subupdate?: string; subdate?: string },
  fileLastModified: number,
): boolean => {
  const episodeDate = parseEpisodeDate(episode.subupdate || episode.subdate || "");
  return episodeDate < new Date(fileLastModified);
};
