import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, FolderOpen, Pencil, Plus, Settings, Timer, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";

declare global {
  interface Window {
    electron?: {
      close: () => void;
      getVersion: () => Promise<string>;
      checkForUpdate: () => Promise<{ status: "dev" | "available" | "up-to-date" | "error"; version?: string; message?: string }>;
      selectFolder: () => Promise<string | null>;
      git: {
        status: (path: string) => Promise<{
          branch: string;
          ahead: number;
          behind: number;
          staged: Array<{ path: string; originalPath?: string; status: string }>;
          unstaged: Array<{ path: string; originalPath?: string; status: string }>;
          untracked: Array<{ path: string; status: string }>;
        }>;
        diff: (path: string, file: string, staged: boolean, untracked: boolean) => Promise<string>;
        stage: (path: string, files: string[]) => Promise<void>;
        unstage: (path: string, files: string[]) => Promise<void>;
        commit: (path: string, message: string) => Promise<void>;
        push: (path: string) => Promise<void>;
        log: (path: string, limit?: number) => Promise<Array<{
          hash: string;
          shortHash: string;
          subject: string;
          author: string;
          date: string;
          refs: string;
        }>>;
      };
      terminal: {
        spawn: (sessionId: string, cols: number, rows: number, config: { command: string; args: string[]; cwd?: string }) => Promise<void>;
        sendInput: (sessionId: string, data: string) => void;
        resize: (sessionId: string, cols: number, rows: number) => void;
        kill: (sessionId: string) => void;
        onData: (sessionId: string, callback: (data: string) => void) => () => void;
        onExit: (sessionId: string, callback: (code: number) => void) => () => void;
      };
      monitor: {
        status: () => Promise<{ installed: boolean; active: boolean; enabled: boolean; failed: boolean; state: string }>;
        install: () => Promise<void>;
        start: () => Promise<void>;
        stop: () => Promise<void>;
        setEnabled: (enabled: boolean) => Promise<void>;
      };
    };
  }
}
import {
  getCryptoPriceV1InvestmentsCryptoPriceCoinIdGetOptions,
  listNotificationsV1NotificationsGetOptions,
  listNotificationsV1NotificationsGetQueryKey,
  markAllNotificationsReadV1NotificationsReadAllPost,
  markNotificationReadV1NotificationsNotificationIdReadPost,
} from "@metron/client";
import { Popover, PopoverContent, PopoverTrigger } from "@metron/ui/components/popover";
import { client } from "@/lib/client";
import { type ClaudeProject, useSettings } from "@/hooks/use-settings";
import { SettingsModal } from "@/components/settings-modal";
import { Counters } from "@/components/counters";
import { useWindowManager } from "@/components/canvas/window-manager";

// Map trading pair symbols to CoinGecko IDs and quote currencies
const QUOTE_SUFFIXES: [string, string][] = [
  ["USDT", "usd"],
  ["USDC", "usd"],
  ["BUSD", "usd"],
  ["USD", "usd"],
  ["EUR", "eur"],
  ["BTC", "btc"],
  ["ETH", "eth"],
];

const SYMBOL_TO_COIN_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  MATIC: "matic-network",
  ATOM: "cosmos",
  LTC: "litecoin",
  UNI: "uniswap",
  NEAR: "near",
  ARB: "arbitrum",
  OP: "optimism",
  APT: "aptos",
  SUI: "sui",
};

function parsePair(pair: string): { coinId: string; currency: string } | null {
  const upper = pair.toUpperCase();
  for (const [quote, currency] of QUOTE_SUFFIXES) {
    if (upper.endsWith(quote)) {
      const base = upper.slice(0, upper.length - quote.length);
      const coinId = SYMBOL_TO_COIN_ID[base];
      if (coinId) return { coinId, currency };
    }
  }
  return null;
}

function CryptoPairTicker({ pair }: { pair: string }) {
  const parsed = parsePair(pair);

  const { data } = useQuery({
    ...getCryptoPriceV1InvestmentsCryptoPriceCoinIdGetOptions({
      client,
      path: { coin_id: parsed?.coinId ?? "" },
      query: { currency: parsed?.currency ?? "usd" },
    }),
    refetchInterval: 30_000,
    enabled: !!parsed,
  });

  if (!parsed) return null;

  const formatted =
    data?.price != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(data.price)
      : null;

  const pct = data?.price_change_pct_24h ?? null;
  const isPositive = pct !== null && pct >= 0;

  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-[10px] font-medium tracking-wider text-orange-400/75">{pair}</span>
      <span className="text-white/15">·</span>
      <span className="font-mono text-[11px] font-medium tabular-nums text-white/75">
        {formatted ?? "—"}
      </span>
      {pct !== null && (
        <span
          className={`flex items-center gap-0.5 font-mono text-[10px] tabular-nums ${
            isPositive ? "text-emerald-400/80" : "text-red-400/80"
          }`}
        >
          {isPositive ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
          {isPositive ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

function ProjectsDropdown() {
  const { settings, update } = useSettings();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPath, setEditPath] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPath, setAddPath] = useState("");

  const reset = () => {
    setEditingId(null);
    setShowAdd(false);
    setAddName("");
    setAddPath("");
  };

  const startEdit = (p: ClaudeProject) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditPath(p.path);
    setShowAdd(false);
  };

  const saveEdit = () => {
    if (!editName.trim() || !editPath.trim()) return;
    update({
      claudeProjects: settings.claudeProjects.map((p) =>
        p.id === editingId ? { ...p, name: editName.trim(), path: editPath.trim() } : p,
      ),
    });
    setEditingId(null);
  };

  const deleteProject = (id: string) => {
    update({ claudeProjects: settings.claudeProjects.filter((p) => p.id !== id) });
    if (editingId === id) setEditingId(null);
  };

  const saveAdd = () => {
    if (!addName.trim() || !addPath.trim()) return;
    update({
      claudeProjects: [
        ...settings.claudeProjects,
        { id: crypto.randomUUID(), name: addName.trim(), path: addPath.trim() },
      ],
    });
    setAddName("");
    setAddPath("");
    setShowAdd(false);
  };

  const browse = async (onSelect: (path: string, name: string) => void, currentName: string) => {
    const selected = await window.electron?.selectFolder();
    if (!selected) return;
    const folderName = selected.split("/").pop() ?? selected;
    onSelect(selected, currentName || folderName);
  };

  return (
    <Popover onOpenChange={(open) => !open && reset()}>
      <PopoverTrigger asChild>
        <button
          title="Projects"
          className="flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70"
        >
          <FolderOpen className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 overflow-hidden rounded-xl border-white/10 bg-black/60 p-0 shadow-2xl backdrop-blur-xl"
      >
        <div className="border-b border-white/10 px-4 py-2.5">
          <span className="text-sm font-medium text-white/80">Projects</span>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {settings.claudeProjects.length === 0 && (
            <div className="py-6 text-center text-xs text-white/30">No projects yet</div>
          )}
          {settings.claudeProjects.map((p) => (
            <div key={p.id} className="border-b border-white/[0.06] last:border-0">
              {editingId === p.id ? (
                <div className="space-y-2 p-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Name"
                    autoFocus
                    className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 outline-none placeholder:text-white/20 focus:border-orange-500/40"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={editPath}
                      onChange={(e) => setEditPath(e.target.value)}
                      placeholder="Path"
                      className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 outline-none placeholder:text-white/20 focus:border-orange-500/40"
                    />
                    <button
                      onClick={() => browse((path, name) => { setEditPath(path); if (!editName) setEditName(name); }, editName)}
                      className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
                    >
                      Browse
                    </button>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded px-2.5 py-1 text-xs text-white/40 transition-colors hover:text-white/70"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={!editName.trim() || !editPath.trim()}
                      className="rounded bg-orange-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-orange-400 disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white/80">{p.name}</p>
                    <p className="truncate text-[11px] text-white/35">{p.path}</p>
                  </div>
                  <button
                    onClick={() => startEdit(p)}
                    className="shrink-0 text-white/25 transition-colors hover:text-white/70"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    onClick={() => deleteProject(p.id)}
                    className="shrink-0 text-white/25 transition-colors hover:text-red-400"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-white/10">
          {showAdd ? (
            <div className="space-y-2 p-3">
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Name"
                autoFocus
                className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 outline-none placeholder:text-white/20 focus:border-orange-500/40"
              />
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={addPath}
                  onChange={(e) => setAddPath(e.target.value)}
                  placeholder="Path"
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 outline-none placeholder:text-white/20 focus:border-orange-500/40"
                />
                <button
                  onClick={() => browse((path, name) => { setAddPath(path); if (!addName) setAddName(name); }, addName)}
                  className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
                >
                  Browse
                </button>
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={() => { setShowAdd(false); setAddName(""); setAddPath(""); }}
                  className="rounded px-2.5 py-1 text-xs text-white/40 transition-colors hover:text-white/70"
                >
                  Cancel
                </button>
                <button
                  onClick={saveAdd}
                  disabled={!addName.trim() || !addPath.trim()}
                  className="rounded bg-orange-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-orange-400 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setShowAdd(true); setEditingId(null); }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-orange-400 transition-colors hover:bg-white/[0.04] hover:text-orange-300"
            >
              <Plus className="size-3.5" />
              Add project
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TimeSinceDropdown() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70">
          <Timer className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="h-80 w-72 overflow-hidden rounded-xl border-white/10 bg-black/60 p-0 shadow-2xl backdrop-blur-xl"
      >
        <Counters />
      </PopoverContent>
    </Popover>
  );
}

function NotificationBell() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...listNotificationsV1NotificationsGetOptions({ client }),
    refetchInterval: 30_000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unread_count ?? 0;

  const markRead = useMutation({
    mutationFn: (id: string) =>
      markNotificationReadV1NotificationsNotificationIdReadPost({
        client,
        path: { notification_id: id },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: listNotificationsV1NotificationsGetQueryKey({ client }),
      }),
  });

  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsReadV1NotificationsReadAllPost({ client }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: listNotificationsV1NotificationsGetQueryKey({ client }),
      }),
  });

  const kindColor: Record<string, string> = {
    info: "bg-sky-400",
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    error: "bg-red-400",
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold leading-none text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex w-80 flex-col overflow-hidden rounded-xl border-white/10 bg-black/60 p-0 shadow-2xl backdrop-blur-xl"
        style={{ maxHeight: "min(28rem, 80vh)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
          <span className="text-sm font-medium text-white/80">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="text-[11px] text-sky-400 transition-colors hover:text-sky-300"
            >
              Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="py-8 text-center text-xs text-white/30">No notifications</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="divide-y divide-white/[0.06]">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read_at) markRead.mutate(n.id);
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.04] ${
                    n.read_at ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        n.read_at ? "bg-white/20" : (kindColor[n.kind] ?? "bg-sky-400")
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-snug text-white/80">{n.title}</p>
                      {n.body && (
                        <p className="mt-0.5 text-[11px] leading-snug text-white/40">{n.body}</p>
                      )}
                      <p className="mt-1 text-[10px] text-white/25">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId, addWorkspace, removeWorkspace, switchWorkspace } = useWindowManager();
  const [menuId, setMenuId] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-0.5">
      {workspaces.map((ws, i) => {
        const isActive = ws.id === activeWorkspaceId;
        return (
          <div key={ws.id} className="relative">
            <button
              onClick={() => switchWorkspace(ws.id)}
              onContextMenu={(e) => { e.preventDefault(); setMenuId(ws.id); }}
              className={`flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-white/15 text-white/90"
                  : "text-white/35 hover:bg-white/[0.08] hover:text-white/70"
              }`}
            >
              {i + 1}
            </button>
            {menuId === ws.id && (
              <WorkspaceContextMenu
                canClose={workspaces.length > 1}
                onClose={() => { removeWorkspace(ws.id); setMenuId(null); }}
                onDismiss={() => setMenuId(null)}
              />
            )}
          </div>
        );
      })}
      <button
        onClick={addWorkspace}
        title="New workspace"
        className="flex h-6 w-6 items-center justify-center rounded text-white/25 transition-colors hover:bg-white/[0.08] hover:text-white/60"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

function WorkspaceContextMenu({ canClose, onClose, onDismiss }: { canClose: boolean; onClose: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const handler = () => onDismiss();
    window.addEventListener("pointerdown", handler);
    return () => window.removeEventListener("pointerdown", handler);
  }, [onDismiss]);

  return (
    <div className="absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-2xl backdrop-blur-xl">
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClose}
        disabled={!canClose}
        className="flex w-full items-center px-4 py-2.5 text-sm text-red-400/80 transition-colors hover:bg-white/[0.06] hover:text-red-400 disabled:cursor-default disabled:opacity-30"
      >
        Close
      </button>
    </div>
  );
}

export function CanvasTopBar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const { settings } = useSettings();

  useEffect(() => {
    window.electron?.getVersion().then(setVersion);
  }, []);

  const pairs = settings.cryptoPairs
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return (
    <div className="fixed left-0 right-0 top-0 z-50 flex items-center border-b border-white/10 bg-black/40 px-4 py-1 backdrop-blur-xl">
      <div className="flex min-w-0 flex-1 items-center gap-5">
        <div className="flex shrink-0 items-center gap-2">
          <span className="bg-gradient-to-r from-white/90 to-white/55 bg-clip-text text-sm font-semibold tracking-wide text-transparent">
            Metron
          </span>
          {version && (
            <span className="rounded bg-white/[0.06] px-1 py-px font-mono text-[10px] text-white/30">
              v{version}
            </span>
          )}
        </div>
        {pairs.length > 0 && (
          <div className="h-3 w-px shrink-0 bg-white/10" />
        )}
        {pairs.map((pair) => (
          <CryptoPairTicker key={pair} pair={pair} />
        ))}
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <WorkspaceSwitcher />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {window.electron && <ProjectsDropdown />}
        <TimeSinceDropdown />
        <NotificationBell />
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70"
        >
          <Settings className="size-4" />
        </button>
        {window.electron && (
          <button
            onClick={() => window.electron!.close()}
            title="Close"
            className="flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-red-400"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
