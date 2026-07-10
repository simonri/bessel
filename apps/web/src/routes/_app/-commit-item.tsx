import type { GitCommit } from "./-git-status";

// ── CommitItem ─────────────────────────────────────────────────────────────────

function shortenRelDate(rel: string): string {
  return rel
    .replace(/(\d+) seconds? ago/, "$1s ago")
    .replace(/(\d+) minutes? ago/, "$1m ago")
    .replace(/(\d+) hours? ago/, "$1h ago")
    .replace(/(\d+) days? ago/, "$1d ago")
    .replace(/(\d+) weeks? ago/, "$1w ago")
    .replace(/(\d+) months? ago/, "$1mo ago")
    .replace(/(\d+) years? ago/, "$1y ago");
}

export function CommitItem({ commit }: { commit: GitCommit }) {
  const refs = commit.refs ? commit.refs.split(", ").filter(Boolean) : [];

  return (
    <div className="cursor-default px-3 py-1.5 hover:bg-white/[0.04]">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 truncate text-xs leading-tight text-white/70">
          {commit.subject}
        </span>
        <span className="shrink-0 whitespace-nowrap text-10 text-white/50">
          {shortenRelDate(commit.date)}
        </span>
      </div>
      {refs.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {refs.map((ref) => {
            const isHead = ref.startsWith("HEAD");
            const isTag = ref.startsWith("tag:");
            const isRemote = !isHead && !isTag && ref.includes("/");
            return (
              <span
                key={ref}
                className={`inline-block rounded px-1 py-0 text-9 font-medium leading-4 ${
                  isHead
                    ? "bg-amber-500/20 text-amber-400/80"
                    : isRemote
                      ? "bg-sky-500/15 text-sky-400/70"
                      : isTag
                        ? "bg-purple-500/15 text-purple-400/70"
                        : "bg-white/10 text-white/50"
                }`}
              >
                {isTag ? ref.slice(5) : ref}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
