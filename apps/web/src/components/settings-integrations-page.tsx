import {
  getAvanzaOptions,
  getLocationHistorySummaryOptions,
  getMontroseOptions,
  listActivitySourcesOptions,
  listBankConnectionsOptions,
} from "@bessel/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Gem,
  HeartPulse,
  Landmark,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  TrendingUp,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { requestAddAccount } from "@/components/accounts/account-actions";
import { ICloudConnectDialog } from "@/components/calendar/icloud-connect-dialog";
import {
  useCalendarAccounts,
  useCalendarActions,
} from "@/components/calendar/use-calendar-data";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { useContactSources } from "@/components/contacts/use-contacts";
import { IntegrationIcon } from "@/components/integration-icons";
import { useOpenPage } from "@/components/open-page-context";
import type { PageKey } from "@/components/pages";
import {
  useCloseSettings,
  useOpenSettings,
} from "@/components/settings-dialog";
import { SettingsPageHeader } from "@/components/settings-ui";
import {
  IconButton,
  PrimaryButton,
  SoftButton,
  TextInput,
} from "@/components/ui-kit";
import { useSettings } from "@/hooks/use-settings";
import { client } from "@/lib/client";
import { isDesktop } from "@/lib/environment";
import { parseAddress } from "@/lib/hyperliquid";
import { cn } from "@/lib/utils";

export type IntegrationsTab = "connected" | "add";

/** Name, what it brings in, status, and the row's menu. */
const COLUMNS =
  "grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,12rem)_1.75rem] items-center gap-4";

interface Item {
  key: string;
  icon: ReactNode;
  name: string;
  detail?: ReactNode;
  brings: string;
  status: ReactNode;
  /** Menu items for a connected row. */
  menu?: ReactNode;
}

function Healthy({ children }: { children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-12 text-white/45">
      <Check className="size-4 shrink-0 text-white/80" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

function Problem({ children }: { children: string }) {
  return (
    <span
      title={children}
      className="flex min-w-0 items-center gap-2 text-12 leading-snug text-amber-300/90"
    >
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
      <span className="line-clamp-2">{children}</span>
    </span>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return <span className="truncate text-12 text-white/40">{children}</span>;
}

/** When it last synced, what went wrong, or that the first sync is still running. */
function syncStatus(lastSyncedAt: Date | null, syncError: string | null) {
  if (syncError) return <Problem>{syncError}</Problem>;
  if (!lastSyncedAt) return <Waiting>Getting the first sync done…</Waiting>;
  return (
    <Healthy>
      Synced {formatDistanceToNow(lastSyncedAt, { addSuffix: true })}
    </Healthy>
  );
}

function Row({ item }: { item: Item }) {
  return (
    <tr
      data-integration={item.key}
      className={cn(
        COLUMNS,
        "h-14 border-b border-white/[0.06] px-2 transition-colors duration-150 hover:bg-white/[0.02]",
      )}
    >
      <td className="flex min-w-0 items-center gap-3">
        {item.icon}
        <div className="min-w-0">
          <p className="truncate text-13 text-white/90">{item.name}</p>
          {item.detail && (
            <p className="truncate text-12 text-white/45">{item.detail}</p>
          )}
        </div>
      </td>
      <td className="truncate text-13 text-white/60">{item.brings}</td>
      <td className="flex min-w-0 items-center">{item.status}</td>
      <td className="flex justify-end">
        {item.menu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton title={`Manage ${item.name}`}>
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{item.menu}</DropdownMenuContent>
          </DropdownMenu>
        )}
      </td>
    </tr>
  );
}

/** A real table, laid out as grid rows so columns line up without table sizing. */
function Table({ items, empty }: { items: Item[]; empty: ReactNode }) {
  return (
    <div className="mt-5">
      <table aria-label="Integrations" className="block w-full">
        <thead className="block">
          <tr
            className={cn(
              COLUMNS,
              "h-9 border-b border-white/10 px-2 text-12 text-white/45",
            )}
          >
            <th className="text-left font-normal">Integration</th>
            <th className="text-left font-normal">Brings in</th>
            <th className="text-left font-normal">Status</th>
            <th className="sr-only">Actions</th>
          </tr>
        </thead>
        <tbody className="block">
          {items.map((item) => (
            <Row key={item.key} item={item} />
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-14 text-center text-13 text-white/45">
          {empty}
        </div>
      )}
    </div>
  );
}

/** Sends the user to a page to finish something there, closing Settings on the way. */
function useGoTo() {
  const openPage = useOpenPage();
  const close = useCloseSettings();
  return (page: PageKey) => {
    close();
    openPage(page);
  };
}

function HyperliquidDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { update } = useSettings();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseAddress(input);
    if (!parsed) {
      setError("That isn't a wallet address. It's 0x and 40 characters.");
      return;
    }
    update({ hyperliquidAddress: parsed });
    setInput("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Hyperliquid</DialogTitle>
          <DialogDescription>
            Bessel follows a wallet&rsquo;s positions read-only. It can&rsquo;t
            trade.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-2">
          <TextInput
            aria-label="Hyperliquid wallet address"
            placeholder="0x… or hypurrscan.io/address/0x…"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            className="font-mono text-12"
          />
          {error && <p className="text-12 text-rose-300">{error}</p>}
          <DialogFooter>
            <PrimaryButton type="submit" disabled={!input.trim()}>
              Add
            </PrimaryButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CopyConnectorAddress({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <SoftButton
      aria-label="Copy the connector address"
      onClick={() => {
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy address"}
    </SoftButton>
  );
}

function matches(item: Item, query: string): boolean {
  const text =
    `${item.name} ${typeof item.detail === "string" ? item.detail : ""} ${item.brings}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

/**
 * Every integration in one place: what's connected and how it's doing, and
 * what can still be added. Pages read from whatever is connected here.
 */
export function IntegrationsPage({
  tab: controlledTab,
  onTabChange,
}: {
  tab?: IntegrationsTab;
  onTabChange?: (tab: IntegrationsTab) => void;
}) {
  const [ownTab, setOwnTab] = useState<IntegrationsTab>("connected");
  const tab = controlledTab ?? ownTab;
  const setTab = onTabChange ?? setOwnTab;
  const [query, setQuery] = useState("");

  const goTo = useGoTo();
  const openSettings = useOpenSettings();
  const { settings, update } = useSettings();
  const { accounts } = useCalendarAccounts();
  const actions = useCalendarActions();
  const { sources, allowEditing } = useContactSources();
  const { data: banks } = useQuery(listBankConnectionsOptions({ client }));
  const { data: avanza } = useQuery(getAvanzaOptions({ client }));
  const { data: montrose } = useQuery(getMontroseOptions({ client }));
  const { data: timeline } = useQuery(
    getLocationHistorySummaryOptions({ client }),
  );
  const { data: activity } = useQuery({
    ...listActivitySourcesOptions({ client }),
    enabled: isDesktop,
  });

  const [icloudOpen, setICloudOpen] = useState(false);
  const [hyperliquidOpen, setHyperliquidOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState<{
    id: string;
    email: string;
  } | null>(null);

  const addMoney = () => {
    goTo("accounts");
    requestAddAccount();
  };
  const lastImport = timeline?.last_import;
  const sendingActivity = (activity?.sources.length ?? 0) > 0;
  const vault = settings.obsidianVaultPath;
  const wallet = settings.hyperliquidAddress;
  const mcpUrl = `${client.getConfig().baseUrl}/mcp`;

  const connected: Item[] = [
    ...accounts.map((account): Item => {
      const google = account.provider === "google";
      const contacts = sources.find((s) => s.email === account.email);
      return {
        key: `calendar-${account.id}`,
        icon: <IntegrationIcon kind={google ? "google" : "apple"} />,
        name: account.email,
        detail: google ? "Google" : "iCloud",
        brings:
          google && account.canReadPeople
            ? "Calendar and contacts"
            : "Calendar",
        status: syncStatus(account.lastSyncedAt, account.syncError),
        menu: (
          <>
            <DropdownMenuItem onSelect={() => actions.syncAccount(account.id)}>
              Sync now
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                google ? actions.connectGoogle() : setICloudOpen(true)
              }
            >
              Reconnect
            </DropdownMenuItem>
            {contacts && !contacts.can_edit && (
              <DropdownMenuItem onSelect={() => allowEditing(contacts.id)}>
                Allow editing contacts
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                setDisconnecting({ id: account.id, email: account.email })
              }
            >
              Disconnect
            </DropdownMenuItem>
          </>
        ),
      };
    }),
    ...(banks?.connections ?? []).map(
      (bank): Item => ({
        key: `bank-${bank.id}`,
        icon: <IntegrationIcon kind="bank" name={bank.bank_name} />,
        name: bank.bank_name,
        detail: `${bank.accounts.length} ${bank.accounts.length === 1 ? "account" : "accounts"}`,
        brings: "Balances and transactions",
        status:
          bank.valid_until < new Date() ? (
            <Problem>Approval has run out - renew it on Accounts</Problem>
          ) : (
            syncStatus(bank.last_synced_at, bank.sync_error)
          ),
        menu: (
          <DropdownMenuItem onSelect={() => goTo("accounts")}>
            Manage on Accounts
          </DropdownMenuItem>
        ),
      }),
    ),
    ...(avanza?.connection
      ? [
          {
            key: "avanza",
            icon: <IntegrationIcon kind="bank" name="Avanza" />,
            name: "Avanza",
            brings: "Stocks and funds",
            status: avanza.connection.credentials_rejected ? (
              <Problem>
                Avanza turned down the login - sign in again on Accounts
              </Problem>
            ) : (
              syncStatus(
                avanza.connection.last_synced_at,
                avanza.connection.sync_error,
              )
            ),
            menu: (
              <DropdownMenuItem onSelect={() => goTo("accounts")}>
                Manage on Accounts
              </DropdownMenuItem>
            ),
          },
        ]
      : []),
    ...(montrose?.connection
      ? [
          {
            key: "montrose",
            icon: <IntegrationIcon kind="bank" name="Montrose" />,
            name: "Montrose",
            brings: "Investments",
            status: montrose.connection.rejected ? (
              <Problem>Montrose needs you to log in again on Accounts</Problem>
            ) : (
              syncStatus(
                montrose.connection.last_synced_at,
                montrose.connection.sync_error,
              )
            ),
            menu: (
              <DropdownMenuItem onSelect={() => goTo("accounts")}>
                Manage on Accounts
              </DropdownMenuItem>
            ),
          },
        ]
      : []),
    ...(lastImport
      ? [
          {
            key: "timeline",
            icon: (
              <IntegrationIcon
                kind="icon"
                icon={<MapPin />}
                tint="bg-sky-500/15 text-sky-300"
              />
            ),
            name: "Google Timeline",
            brings: "Places you've been",
            status: (
              <Healthy>
                Imported {format(lastImport.created_at, "d MMM yyyy")}
              </Healthy>
            ),
            menu: (
              <DropdownMenuItem onSelect={() => goTo("googleTimeline")}>
                Import again
              </DropdownMenuItem>
            ),
          },
        ]
      : []),
    ...(isDesktop && sendingActivity
      ? [
          {
            key: "monitor",
            icon: (
              <IntegrationIcon
                kind="icon"
                icon={<Activity />}
                tint="bg-emerald-500/15 text-emerald-300"
              />
            ),
            name: "Activity monitor",
            detail: "This computer",
            brings: "Screen time",
            status: <Healthy>Sending activity</Healthy>,
            menu: (
              <DropdownMenuItem onSelect={() => openSettings("monitor")}>
                Monitor settings
              </DropdownMenuItem>
            ),
          },
        ]
      : []),
    ...(isDesktop && vault
      ? [
          {
            key: "obsidian",
            icon: (
              <IntegrationIcon
                kind="icon"
                icon={<Gem />}
                tint="bg-violet-500/15 text-violet-300"
              />
            ),
            name: "Obsidian",
            detail: vault,
            brings: "Notes",
            status: <Healthy>Vault chosen</Healthy>,
            menu: (
              <DropdownMenuItem onSelect={() => goTo("obsidian")}>
                Change vault
              </DropdownMenuItem>
            ),
          },
        ]
      : []),
    ...(wallet
      ? [
          {
            key: "hyperliquid",
            icon: (
              <IntegrationIcon
                kind="icon"
                icon={<TrendingUp />}
                tint="bg-teal-500/15 text-teal-300"
              />
            ),
            name: "Hyperliquid",
            detail: `${wallet.slice(0, 6)}…${wallet.slice(-4)}`,
            brings: "Trading positions",
            status: <Healthy>Read-only</Healthy>,
            menu: (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => update({ hyperliquidAddress: null })}
              >
                Remove
              </DropdownMenuItem>
            ),
          },
        ]
      : []),
  ];

  /** What can still be added, with the step that adds it. */
  const addable: (Item & { add?: { label: string; run: () => void } })[] = [
    {
      key: "add-google",
      icon: <IntegrationIcon kind="google" />,
      name: "Google",
      brings: "Calendar and contacts",
      status: null,
      add: { label: "Connect", run: actions.connectGoogle },
    },
    {
      key: "add-icloud",
      icon: <IntegrationIcon kind="apple" />,
      name: "iCloud",
      brings: "Calendar",
      status: null,
      add: { label: "Connect", run: () => setICloudOpen(true) },
    },
    {
      key: "add-money",
      icon: (
        <IntegrationIcon
          kind="icon"
          icon={<Landmark />}
          tint="bg-primary-500/15 text-primary-300"
        />
      ),
      name: "Bank or broker",
      detail: "Banks, Avanza, Montrose, Klarna",
      brings: "Money and investments",
      status: null,
      add: { label: "Add", run: addMoney },
    },
    {
      key: "add-health",
      icon: (
        <IntegrationIcon
          kind="icon"
          icon={<HeartPulse />}
          tint="bg-rose-500/15 text-rose-300"
        />
      ),
      name: "Apple Health",
      brings: "Sleep, workouts and activity",
      status: <Waiting>Turned on in the iPhone app</Waiting>,
    },
    ...(lastImport
      ? []
      : [
          {
            key: "add-timeline",
            icon: (
              <IntegrationIcon
                kind="icon"
                icon={<MapPin />}
                tint="bg-sky-500/15 text-sky-300"
              />
            ),
            name: "Google Timeline",
            brings: "Places you've been",
            status: null,
            add: { label: "Import", run: () => goTo("googleTimeline") },
          },
        ]),
    ...(isDesktop && !sendingActivity
      ? [
          {
            key: "add-monitor",
            icon: (
              <IntegrationIcon
                kind="icon"
                icon={<Activity />}
                tint="bg-emerald-500/15 text-emerald-300"
              />
            ),
            name: "Activity monitor",
            detail: "This computer",
            brings: "Screen time",
            status: null,
            add: { label: "Set up", run: () => openSettings("monitor") },
          },
        ]
      : []),
    ...(isDesktop && !vault
      ? [
          {
            key: "add-obsidian",
            icon: (
              <IntegrationIcon
                kind="icon"
                icon={<Gem />}
                tint="bg-violet-500/15 text-violet-300"
              />
            ),
            name: "Obsidian",
            brings: "Notes",
            status: null,
            add: { label: "Choose vault", run: () => goTo("obsidian") },
          },
        ]
      : []),
    ...(wallet
      ? []
      : [
          {
            key: "add-hyperliquid",
            icon: (
              <IntegrationIcon
                kind="icon"
                icon={<TrendingUp />}
                tint="bg-teal-500/15 text-teal-300"
              />
            ),
            name: "Hyperliquid",
            brings: "Trading positions",
            status: null,
            add: { label: "Add", run: () => setHyperliquidOpen(true) },
          },
        ]),
    {
      key: "add-claude",
      icon: (
        <IntegrationIcon
          kind="icon"
          icon={<MessageSquare />}
          tint="bg-orange-500/15 text-orange-300"
        />
      ),
      name: "Claude",
      detail: <span className="font-mono">{mcpUrl}</span>,
      brings: "Reads all of this when you ask",
      status: <CopyConnectorAddress url={mcpUrl} />,
    },
  ];
  const addItems: Item[] = addable.map(({ add, ...item }) =>
    add
      ? {
          ...item,
          status: <SoftButton onClick={add.run}>{add.label}</SoftButton>,
        }
      : item,
  );

  const items = (tab === "connected" ? connected : addItems).filter((item) =>
    matches(item, query),
  );

  return (
    <>
      <SettingsPageHeader
        title="Integrations"
        beside={
          <div
            role="tablist"
            aria-label="Show"
            className="flex rounded-lg bg-white/[0.05] p-0.5"
          >
            {(
              [
                ["connected", "Connected"],
                ["add", "Add more"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "h-7 rounded-md px-3 text-13 transition-colors duration-150",
                  tab === key
                    ? "bg-white/10 text-white/90"
                    : "text-white/55 hover:text-white/85",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <label className="relative">
          <span className="sr-only">Search integrations</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-white/35" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-8 w-56 rounded-lg border border-white/10 bg-white/[0.04] pr-2.5 pl-8 text-13 text-white/85 outline-none transition-colors duration-150 placeholder:text-white/30 hover:border-white/15 focus:border-white/20 focus:bg-white/[0.06]"
          />
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/90 px-3 text-13 font-medium text-neutral-900 transition-colors duration-150 hover:bg-white"
            >
              <Plus className="size-4" />
              Add
              <ChevronDown className="size-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {addable
              .filter((item) => item.add)
              .map((item) => (
                <DropdownMenuItem key={item.key} onSelect={item.add?.run}>
                  {item.name}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingsPageHeader>

      <Table
        items={items}
        empty={
          query.trim() ? (
            <>No integrations match &ldquo;{query.trim()}&rdquo;.</>
          ) : (
            <>
              <p>Nothing connected yet.</p>
              <SoftButton onClick={() => setTab("add")}>
                See what you can add
              </SoftButton>
            </>
          )
        }
      />

      <ICloudConnectDialog
        open={icloudOpen}
        onOpenChange={setICloudOpen}
        onConnect={actions.connectICloud}
      />
      <HyperliquidDialog
        open={hyperliquidOpen}
        onOpenChange={setHyperliquidOpen}
      />
      <ConfirmDeleteDialog
        open={disconnecting !== null}
        onOpenChange={(open) => !open && setDisconnecting(null)}
        title="Disconnect this account?"
        description={
          <>
            {disconnecting?.email}&rsquo;s calendars and contacts leave Bessel.
            Nothing changes in the account itself.
          </>
        }
        confirmLabel="Disconnect"
        onConfirm={() => {
          if (disconnecting) actions.disconnectAccount(disconnecting.id);
          setDisconnecting(null);
        }}
      />
    </>
  );
}
