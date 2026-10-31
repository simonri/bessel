import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@bessel/ui/components/hover-card";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { GitBranch } from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { claudeSessionsApi } from "@/components/claude-sessions/claude-sessions-store";
import type {
  ClaudeConversation,
  ClaudeConversationPreview,
  ClaudeExchange,
} from "@/components/claude-sessions/claude-sessions-types";
import { cn } from "@/lib/utils";

// Keyed by when the transcript last changed, so a conversation that moved on
// since is read again.
const cache = new Map<string, ClaudeConversationPreview | null>();

const cacheKey = (c: ClaudeConversation) => `${c.sessionId}:${c.updatedAt}`;

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; preview: ClaudeConversationPreview | null }
  | { status: "error" };

// A running conversation moves on without its key changing, so it is read
// again on every open, showing the last copy meanwhile.
function usePreview(
  cwd: string,
  conversation: ClaudeConversation,
  live: boolean,
) {
  const key = cacheKey(conversation);
  const [state, setState] = useState<PreviewState>(() =>
    cache.has(key)
      ? { status: "ready", preview: cache.get(key) ?? null }
      : { status: "loading" },
  );
  useEffect(() => {
    if (cache.has(key)) {
      setState({ status: "ready", preview: cache.get(key) ?? null });
      if (!live) return;
    } else {
      setState({ status: "loading" });
    }
    let cancelled = false;
    Promise.resolve()
      .then(() =>
        claudeSessionsApi().conversationPreview(cwd, conversation.sessionId),
      )
      .then(
        (preview) => {
          cache.set(key, preview);
          if (!cancelled) setState({ status: "ready", preview });
        },
        () => {
          if (!cancelled && !cache.has(key)) setState({ status: "error" });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [cwd, conversation.sessionId, key, live]);
  return state;
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

function Prompt({ children }: { children: ReactNode }) {
  return (
    // The clamp sits inside the padding, or the cut line shows through it.
    <div className="max-w-[88%] self-end rounded-lg rounded-br-sm bg-primary-500/15 px-2.5 py-1.5 text-12 text-white/85">
      <p className="line-clamp-2">{children}</p>
    </div>
  );
}

function Reply({ children }: { children: ReactNode }) {
  return (
    <p className="line-clamp-4 border-l border-white/10 pl-2.5 text-12 leading-relaxed text-white/55">
      {children}
    </p>
  );
}

// Earlier exchanges show only what was asked: the prompts are what one
// remembers a conversation by, and the card stays short.
function Exchange({
  exchange,
  latest,
}: {
  exchange: ClaudeExchange;
  latest: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {exchange.prompt && <Prompt>{exchange.prompt}</Prompt>}
      {latest && exchange.reply && <Reply>{exchange.reply}</Reply>}
    </div>
  );
}

function PreviewBody({ state }: { state: PreviewState }) {
  if (state.status === "loading")
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="ml-auto h-7 w-3/5 bg-white/[0.06]" />
        <Skeleton className="h-10 w-full bg-white/[0.04]" />
        <Skeleton className="ml-auto h-7 w-2/5 bg-white/[0.06]" />
        <Skeleton className="h-10 w-full bg-white/[0.04]" />
      </div>
    );
  const preview = state.status === "ready" ? state.preview : null;
  if (!preview || preview.exchanges.length === 0)
    return (
      <p className="text-12 text-white/40">
        {state.status === "error"
          ? "Couldn't read this conversation."
          : "Nothing said in this conversation yet."}
      </p>
    );
  return (
    <div className="flex flex-col gap-3">
      {preview.opening && (
        <div className="flex flex-col gap-1">
          <span className="type-section text-white/40">Started with</span>
          <p className="line-clamp-2 text-12 text-white/60">
            {preview.opening}
          </p>
          <span
            aria-hidden
            className="mt-1 flex items-center gap-2 text-11 text-white/25"
          >
            <span className="h-px flex-1 bg-white/[0.08]" />
            Latest
            <span className="h-px flex-1 bg-white/[0.08]" />
          </span>
        </div>
      )}
      {preview.exchanges.map((exchange, i) => (
        <Exchange
          key={`${exchange.at}-${exchange.prompt}`}
          exchange={exchange}
          latest={i === preview.exchanges.length - 1}
        />
      ))}
    </div>
  );
}

function PreviewCard({
  cwd,
  conversation,
  live,
}: {
  cwd: string;
  conversation: ClaudeConversation;
  live: boolean;
}) {
  const state = usePreview(cwd, conversation, live);
  const latest =
    state.status === "ready" ? state.preview?.exchanges.at(-1) : undefined;
  const body = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    // What overflows the top of a bottom-anchored box isn't in its
    // scrollHeight, so measure the content itself.
    const el = body.current;
    const content = el?.firstElementChild as HTMLElement | null;
    if (!el || !content) return;
    const { paddingTop, paddingBottom } = getComputedStyle(el);
    const room =
      el.clientHeight -
      Number.parseFloat(paddingTop) -
      Number.parseFloat(paddingBottom);
    setClipped(content.offsetHeight > room + 1);
  }, [state]);
  return (
    <>
      <div className="flex flex-col gap-1 border-b border-white/[0.06] px-3.5 pb-2.5 pt-3">
        <p className="line-clamp-2 text-13 font-medium text-white/90">
          {conversation.title}
        </p>
        <div className="flex items-center gap-1.5 text-11 text-white/40">
          <span className="tabular-nums">
            {new Date(latest?.at ?? conversation.updatedAt).toLocaleString(
              undefined,
              DATE_FORMAT,
            )}
          </span>
          {conversation.worktree && (
            <span className="flex min-w-0 items-center gap-1">
              <span aria-hidden>·</span>
              <GitBranch className="size-3 shrink-0" />
              <span className="truncate">{conversation.worktree}</span>
            </span>
          )}
          <span className="ml-auto shrink-0 font-mono text-11 text-white/30">
            {conversation.sessionId.slice(0, 8)}
          </span>
        </div>
      </div>
      {/* Anchored to the bottom: short on room, the oldest lines give way
          and the latest exchange stays in view. */}
      <div
        ref={body}
        className={cn(
          "flex max-h-[min(24rem,calc(var(--radix-hover-card-content-available-height)-4.5rem))] flex-col justify-end overflow-hidden px-3.5 py-3",
          clipped &&
            "[mask-image:linear-gradient(to_bottom,transparent,black_3rem)]",
        )}
      >
        <PreviewBody state={state} />
      </div>
    </>
  );
}

/**
 * Shows the last few exchanges of a conversation beside its row, to tell
 * apart conversations that share a name. `live` for one still running, which
 * is read afresh each time. Other props go to the trigger, so it can sit
 * inside another trigger such as a context menu's.
 */
export function ConversationPreview({
  cwd,
  conversation,
  live = false,
  children,
  ...triggerProps
}: {
  cwd: string;
  /** Null: no card, the child renders as it is. */
  conversation: ClaudeConversation | null;
  live?: boolean;
  children: ReactNode;
} & Omit<ComponentProps<typeof HoverCardTrigger>, "asChild" | "children">) {
  return (
    <HoverCard openDelay={350} closeDelay={80}>
      <HoverCardTrigger asChild {...triggerProps}>
        {children}
      </HoverCardTrigger>
      {conversation && (
        <HoverCardContent
          side="right"
          align="start"
          sideOffset={12}
          collisionPadding={16}
          className="w-[22rem] overflow-hidden rounded-xl border-white/10 p-0 shadow-2xl"
        >
          <PreviewCard cwd={cwd} conversation={conversation} live={live} />
        </HoverCardContent>
      )}
    </HoverCard>
  );
}
