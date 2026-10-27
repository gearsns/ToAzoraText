const ESCAPE_CHARS: Record<string, string> = {
  "&": "&amp;",
  "'": "&#x27;",
  "`": "&#x60;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
};

export const escapeHtml = (text: string): string =>
  text.replace(/[&'`"<>]/g, (match) => ESCAPE_CHARS[match] ?? match);
