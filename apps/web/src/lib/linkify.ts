export type TextPart =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

const LINK_RE =
  /\b(?:https?:\/\/|mailto:)[^\s<>"]+|\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;
const TRAILING = /[.,;:!?'"*]+$/;

/** Drops sentence punctuation and a closing bracket the link didn't open, as in "(see https://x.se/a)." */
function trimLink(raw: string): string {
  let link = raw.replace(TRAILING, "");
  while (
    link.endsWith(")") &&
    (link.match(/\(/g)?.length ?? 0) < (link.match(/\)/g)?.length ?? 0)
  ) {
    link = link.slice(0, -1).replace(TRAILING, "");
  }
  return link;
}

/** Plain text split into text and http(s), mailto and email links, ready to render as anchors. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const link = trimLink(match[0]);
    const start = match.index ?? 0;
    if (!link) continue;
    if (start > last)
      parts.push({ type: "text", text: text.slice(last, start) });
    const href = /^(?:https?:|mailto:)/i.test(link) ? link : `mailto:${link}`;
    parts.push({ type: "link", text: link, href });
    last = start + link.length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}
