// Small fuzzy-match scorer for the quick switcher. Not a general-purpose
// library — tuned for ranking vault-relative note paths against a short
// typed query (exact/prefix/substring beat a subsequence match).

/**
 * Scores how well `query` matches `target` (case-insensitive). Higher is
 * better; `null` means no match at all (every query character must appear,
 * in order, somewhere in `target`).
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = target.toLowerCase();

  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - (t.length - q.length);

  const substringAt = t.indexOf(q);
  if (substringAt !== -1) return 600 - substringAt;

  let score = 0;
  let cursor = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, cursor);
    if (found === -1) return null;
    streak = found === cursor ? streak + 1 : 0;
    score += 10 + streak * 5 - (found - cursor);
    cursor = found + 1;
  }
  return score;
}
