/** A run of email text: either plain text or a web link. */
export type TextPart = { kind: 'text'; value: string } | { kind: 'link'; value: string };

// A host must follow "//" directly: the URL parser reads "https:///path" as "https://path/", which
// would turn a malformed address into a link to an unintended site.
const URL_PATTERN = /https?:\/\/(?=[^\s<>"'`/])[^\s<>"'`]+/gi;

/** Closing characters that belong to the URL only when it also contains the matching opener. */
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/**
 * Whether `value` is an http(s) URL with a host. Anything else (javascript:, file:, obsidian:, …) is
 * never opened. A host must follow "//" directly, because the URL parser reads "https:///path" as
 * "https://path/", which would send a hostless string to an unintended site.
 */
export function isWebUrl(value: string): boolean {
  if (!/^https?:\/\/[^/\s]/i.test(value)) return false;
  try {
    const { protocol, hostname } = new URL(value);
    return (protocol === 'http:' || protocol === 'https:') && hostname !== '';
  } catch {
    return false;
  }
}

/** Drops punctuation that ends a sentence rather than the URL, e.g. "see https://a.b/c)." */
function trimTrailing(url: string): string {
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1];
    if ('.,;:!?*'.includes(last)) { end--; continue; }
    const opener = CLOSERS[last];
    if (opener !== undefined) {
      const body = url.slice(0, end);
      const opens = body.split(opener).length - 1;
      const closes = body.split(last).length - 1;
      if (closes > opens) { end--; continue; }
    }
    break;
  }
  return url.slice(0, end);
}

/**
 * Splits text into plain runs and http(s) links, in order, so that joining every `value` gives the
 * original text back. Only well-formed http(s) URLs become links.
 */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  const pushText = (end: number) => {
    if (end > cursor) parts.push({ kind: 'text', value: text.slice(cursor, end) });
  };

  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimTrailing(match[0]);
    if (!isWebUrl(url)) continue;
    pushText(match.index);
    parts.push({ kind: 'link', value: url });
    cursor = match.index + url.length;
  }
  pushText(text.length);
  return parts;
}
