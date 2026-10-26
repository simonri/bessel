import {
  getAvanzaOptions,
  getLocationHistorySummaryOptions,
  getMontroseOptions,
  listActivitySourcesOptions,
  listBankConnectionsOptions,
} from "@bessel/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Check, Copy, MoreHorizontal, Plus } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { requestAddAccount } from "@/components/accounts/account-actions";
import { ICloudConnectDialog } from "@/components/calendar/icloud-connect-dialog";
import {
  useCalendarAccounts,
  useCalendarActions,
} from "@/components/calendar/use-calendar-data";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { useContactSources } from "@/components/contacts/use-contacts";
import { useOpenPage } from "@/components/open-page-context";
import type { PageKey } from "@/components/pages";
import {
  useCloseSettings,
  useOpenSettings,
} from "@/components/settings-dialog";
import {
  IconButton,
  Panel,
  PrimaryButton,
  SectionLabel,
  SoftButton,
  TextInput,
} from "@/components/ui-kit";
import { useSettings } from "@/hooks/use-settings";
import { client } from "@/lib/client";
import { isDesktop } from "@/lib/environment";
import { parseAddress } from "@/lib/hyperliquid";
import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "off";

/** "Synced 5 minutes ago", what went wrong, or that the first sync is still running. */
function syncStatus(
  lastSyncedAt: Date | null,
  syncError: string | null,
): { text: string; tone: Tone } {
  if (syncError) return { text: syncError, tone: "warn" };
  if (!lastSyncedAt)
    return { text: "Getting the first sync done…", tone: "off" };
  return {
    text: `Synced ${formatDistanceToNow(lastSyncedAt, { addSuffix: true })}`,
    tone: "ok",
  };
}

function Status({ text, tone }: { text: string; tone: Tone }) {
  return (
    <p
      className={cn(
        "text-11 leading-snug",
        tone === "warn" ? "text-amber-300/90" : "text-white/40",
      )}
    >
      {text}
    </p>
  );
}

/** One connected thing: what it is, what it gives Bessel, how it's doing, and what can be done with it. */
function Row({
  title,
  provides,
  status,
  children,
}: {
  title: ReactNode;
  provides?: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-13 text-white/85">{title}</p>
        {provides && <p className="text-11 text-white/55">{provides}</p>}
        {status}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-1">{children}</div>
      )}
    </div>
  );
}

function Group({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <p className="text-12 text-white/45">{hint}</p>
      {actions && <div className="mt-2 flex flex-wrap gap-1.5">{actions}</div>}
      <Panel className="mt-3">{children}</Panel>
    </section>
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

function CalendarAndContacts() {
  const { accounts } = useCalendarAccounts();
  const actions = useCalendarActions();
  const { sources, allowEditing } = useContactSources();
  const [icloudOpen, setICloudOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState<{
    id: string;
    email: string;
  } | null>(null);

  return (
    <Group
      title="Calendar and contacts"
      hint="Calendars from every account show up together. Contacts come from Google."
      actions={
        <>
          <SoftButton onClick={actions.connectGoogle}>
            <Plus />
            Google
          </SoftButton>
          <SoftButton onClick={() => setICloudOpen(true)}>
            <Plus />
            iCloud
          </SoftButton>
        </>
      }
    >
      {accounts.length === 0 && (
        <Row
          title="Nothing connected yet"
          status={
            <Status
              text="Add a Google or iCloud account to see your calendar and contacts."
              tone="off"
            />
          }
        />
      )}
      {accounts.map((account) => {
        const google = account.provider === "google";
        const contacts = sources.find((s) => s.email === account.email);
        return (
          <Row
            key={account.id}
            title={account.email}
            provides={
              google
                ? account.canReadPeople
                  ? "Calendar and contacts, from Google"
                  : "Calendar, from Google"
                : "Calendar, from iCloud"
            }
            status={
              <Status
                {...syncStatus(account.lastSyncedAt, account.syncError)}
              />
            }
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton title={`Manage ${account.email}`}>
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => actions.syncAccount(account.id)}
                >
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
              </DropdownMenuContent>
            </DropdownMenu>
          </Row>
        );
      })}
      <ICloudConnectDialog
        open={icloudOpen}
        onOpenChange={setICloudOpen}
        onConnect={actions.connectICloud}
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
    </Group>
  );
}

function Money() {
  const goTo = useGoTo();
  const { data: banks } = useQuery(listBankConnectionsOptions({ client }));
  const { data: avanza } = useQuery(getAvanzaOptions({ client }));
  const { data: montrose } = useQuery(getMontroseOptions({ client }));
  const connections = banks?.connections ?? [];
  const nothing =
    connections.length === 0 && !avanza?.connection && !montrose?.connection;

  return (
    <Group
      title="Money"
      hint="Banks, Avanza, Montrose and Klarna are added on Accounts, where you choose which accounts to bring in."
      actions={
        <SoftButton
          onClick={() => {
            goTo("accounts");
            requestAddAccount();
          }}
        >
          <Plus />
          Bank or broker
        </SoftButton>
      }
    >
      {nothing && (
        <Row
          title="Nothing connected yet"
          status={
            <Status
              text="Add a bank or broker to see balances, spending and investments."
              tone="off"
            />
          }
        />
      )}
      {connections.map((bank) => (
        <Row
          key={bank.id}
          title={bank.bank_name}
          provides={`${bank.accounts.length} ${bank.accounts.length === 1 ? "account" : "accounts"}`}
          status={
            <Status
              {...(bank.valid_until < new Date()
                ? {
                    text: "Approval has run out - renew it on Accounts",
                    tone: "warn" as const,
                  }
                : syncStatus(bank.last_synced_at, bank.sync_error))}
            />
          }
        >
          <SoftButton onClick={() => goTo("accounts")}>Manage</SoftButton>
        </Row>
      ))}
      {avanza?.connection && (
        <Row
          title="Avanza"
          provides="Stocks and funds"
          status={
            <Status
              {...(avanza.connection.credentials_rejected
                ? {
                    text: "Avanza turned down the login - sign in again on Accounts",
                    tone: "warn" as const,
                  }
                : syncStatus(
                    avanza.connection.last_synced_at,
                    avanza.connection.sync_error,
                  ))}
            />
          }
        >
          <SoftButton onClick={() => goTo("accounts")}>Manage</SoftButton>
        </Row>
      )}
      {montrose?.connection && (
        <Row
          title="Montrose"
          provides="Investments"
          status={
            <Status
              {...(montrose.connection.rejected
                ? {
                    text: "Montrose needs you to log in again on Accounts",
                    tone: "warn" as const,
                  }
                : syncStatus(
                    montrose.connection.last_synced_at,
                    montrose.connection.sync_error,
                  ))}
            />
          }
        >
          <SoftButton onClick={() => goTo("accounts")}>Manage</SoftButton>
        </Row>
      )}
    </Group>
  );
}

function HealthAndPlaces() {
  const goTo = useGoTo();
  const { data: timeline } = useQuery(
    getLocationHistorySummaryOptions({ client }),
  );
  const lastImport = timeline?.last_import;
  return (
    <Group
      title="Health and places"
      hint="Sleep, workouts and where you've been."
    >
      <Row
        title="Apple Health"
        provides="Sleep, workouts and activity"
        status={
          <Status
            text="Turned on in the Bessel app on your iPhone"
            tone="off"
          />
        }
      />
      <Row
        title="Google Timeline"
        provides="Places you've been"
        status={
          <Status
            text={
              lastImport
                ? `Last imported ${format(lastImport.created_at, "d MMMM yyyy")}`
                : "Not imported yet"
            }
            tone="off"
          />
        }
      >
        <SoftButton onClick={() => goTo("googleTimeline")}>Import</SoftButton>
      </Row>
    </Group>
  );
}

function ThisComputer() {
  const goTo = useGoTo();
  const openSettings = useOpenSettings();
  const { settings } = useSettings();
  const { data: activity } = useQuery(listActivitySourcesOptions({ client }));
  const sending = (activity?.sources.length ?? 0) > 0;
  return (
    <Group
      title="On this computer"
      hint="Things only the desktop app can reach."
    >
      <Row
        title="Activity monitor"
        provides="Screen time"
        status={
          <Status
            text={sending ? "Sending activity" : "Not set up yet"}
            tone="off"
          />
        }
      >
        <SoftButton onClick={() => openSettings("monitor")}>Set up</SoftButton>
      </Row>
      <Row
        title="Obsidian"
        provides="Notes"
        status={
          <Status
            text={settings.obsidianVaultPath ?? "No vault chosen"}
            tone="off"
          />
        }
      >
        <SoftButton onClick={() => goTo("obsidian")}>
          {settings.obsidianVaultPath ? "Change" : "Choose"}
        </SoftButton>
      </Row>
    </Group>
  );
}

function Hyperliquid() {
  const { settings, update } = useSettings();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const address = settings.hyperliquidAddress;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseAddress(input);
    if (!parsed) {
      setError("That isn't a wallet address. It's 0x and 40 characters.");
      return;
    }
    update({ hyperliquidAddress: parsed });
    setInput("");
  };

  if (address)
    return (
      <Row
        title="Hyperliquid"
        provides="Trading positions"
        status={
          <Status
            text={`${address.slice(0, 6)}…${address.slice(-4)}, read-only`}
            tone="off"
          />
        }
      >
        <SoftButton onClick={() => update({ hyperliquidAddress: null })}>
          Remove
        </SoftButton>
      </Row>
    );
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 px-4 py-3">
      <div>
        <p className="text-13 text-white/85">Hyperliquid</p>
        <p className="text-11 text-white/55">Trading positions</p>
      </div>
      <div className="flex gap-2">
        <TextInput
          aria-label="Hyperliquid wallet address"
          placeholder="0x… or hypurrscan.io/address/0x…"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          className="h-7 font-mono text-12"
        />
        <PrimaryButton type="submit" size="sm" disabled={!input.trim()}>
          Add
        </PrimaryButton>
      </div>
      {error && <p className="text-11 text-rose-300">{error}</p>}
    </form>
  );
}

function Claude() {
  const url = `${client.getConfig().baseUrl}/mcp`;
  const [copied, setCopied] = useState(false);
  return (
    <Row
      title="Claude"
      provides="Reads all of the above when you ask"
      status={
        <p className="text-11 text-white/40">
          Add <span className="font-mono text-white/60">{url}</span> as a
          connector in Claude
        </p>
      }
    >
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
        {copied ? "Copied" : "Copy"}
      </SoftButton>
    </Row>
  );
}

/** Every integration in one place. Pages read from whatever is connected here. */
export function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <CalendarAndContacts />
      <Money />
      <HealthAndPlaces />
      {isDesktop && <ThisComputer />}
      <Group title="Also" hint="Read-only links to other places.">
        <Hyperliquid />
        <Claude />
      </Group>
    </div>
  );
}
