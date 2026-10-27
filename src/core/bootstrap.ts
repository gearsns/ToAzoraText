import type { SiteAdapter } from "../sites/types";
import { mountPanel, type PanelHandle, type PanelOptions } from "../ui/panel";
import { NovelStorage } from "./storage";

/**
 * ブックマークレットの本体。
 * 許可されていないサイトでは何もせず null を返す。
 */
export const runBookmarklet = async (
  site: SiteAdapter,
  overrides: Partial<PanelOptions> = {},
): Promise<PanelHandle | null> => {
  const doc = overrides.doc ?? document;
  if (!site.allowedOrigins.includes(doc.location.origin)) {
    return null;
  }
  const handle = mountPanel({ site, storage: new NovelStorage(), ...overrides });
  await handle.refresh();
  return handle;
};
