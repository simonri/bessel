import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  LogOut,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { pastel } from "@/components/hyperliquid/coin-badge";
import { PnlChart } from "@/components/hyperliquid/pnl-chart";
import {
  LiveBadge,
  PositionsList,
  totalUnrealized,
} from "@/components/hyperliquid/positions-list";
import { Segmented } from "@/components/hyperliquid/segmented";
import { SpotList } from "@/components/hyperliquid/spot-list";
import { StatCard } from "@/components/hyperliquid/stat-card";
import {
  IconButton,
  PrimaryButton,
  SectionLabel,
  TextInput,
} from "@/components/ui-kit";
import { useSettings } from "@/hooks/use-settings";
import {
  currentValue,
  fetchMids,
  fetchPortfolio,
  fetchSpotBalances,
  fetchSubAccounts,
  type Portfolio,
  parseAddress,
  portfolioKey,
  RANGES,
  type Range,
  rangePnl,
  type Scope,
  type SubAccount,
  shortAddress,
} from "@/lib/hyperliquid";
import { useHyperliquidPerp } from "@/lib/hyperliquid-live";
import { cn } from "@/lib/utils";
import {
  formatSignedUsd,
  formatUsd,
  formatVolume,
  pnlHeadline,
  pnlTone,
  RANGE_LABELS,
} from "./-hyperliquid-format";

export const Route = createFileRoute("/_app/hyperliquid")({
  component: HyperliquidPage,
});

// Account data moves with the market; prices are cheap to refresh.
const REFRESH_MS = 60_000;

function portfolioQuery(address: string) {
  return {
    queryKey: ["hyperliquid", "portfolio", address],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchPortfolio(address, signal),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  };
}

function HyperliquidPage() {
  const { settings, update } = useSettings();
  const address = settings.hyperliquidAddress;

  if (!address) {
    return (
      <ConnectForm
        onConnect={(value) => update({ hyperliquidAddress: value })}
      />
    );
  }
  return (
    <HyperliquidAccount
      key={address}
      master={address}
      onDisconnect={() => update({ hyperliquidAddress: null })}
    />
  );
}

function ConnectForm({ onConnect }: { onConnect: (address: string) => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const address = parseAddress(input);
    if (!address) {
      setError(
        "That isn't a wallet address. It looks like 0x followed by 40 characters.",
      );
      return;
    }
    onConnect(address);
  };

  return (
    <div className="flex min-h-[60%] items-center justify-center py-10">
      <form
        onSubmit={submit}
        className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl bg-white/[0.03] px-6 py-8 text-center ring-1 ring-white/[0.06]"
      >
        <span
          className="flex size-11 items-center justify-center rounded-full"
          style={{ backgroundColor: pastel(165, 0.16), color: pastel(165) }}
        >
          <Wallet className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-white/90">
            Connect your Hyperliquid account
          </h2>
          <p className="text-xs leading-relaxed text-white/45">
            Paste your wallet address or a Hypurrscan link. It's read-only:
            Hyperliquid account data is public, and the address is only saved in
            this browser.
          </p>
        </div>
        <div className="flex w-full gap-2">
          <TextInput
            autoFocus
            aria-label="Wallet address"
            placeholder="0x… or hypurrscan.io/address/0x…"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            className="font-mono text-12"
          />
          <PrimaryButton type="submit" disabled={!input.trim()}>
            Connect
          </PrimaryButton>
        </div>
        {error && <p className="text-12 text-rose-300">{error}</p>}
      </form>
    </div>
  );
}

function HyperliquidAccount({
  master,
  onDisconnect,
}: {
  master: string;
  onDisconnect: () => void;
}) {
  const [selected, setSelected] = useState(master);
  const [range, setRange] = useState<Range>("month");
  const [scope, setScope] = useState<Scope>("total");

  const { data: subAccounts = [] } = useQuery({
    queryKey: ["hyperliquid", "subAccounts", master],
    queryFn: ({ signal }) => fetchSubAccounts(master, signal),
    staleTime: 5 * 60_000,
  });
  const accounts: SubAccount[] = useMemo(
    () => [{ name: "Main account", address: master }, ...subAccounts],
    [master, subAccounts],
  );
  // Every account's history: the selected one for the chart, all of them
  // for their current values.
  const portfolios = useQueries({
    queries: accounts.map((a) => portfolioQuery(a.address)),
  });
  const portfolioOf = (address: string): Portfolio | undefined =>
    portfolios[accounts.findIndex((a) => a.address === address)]?.data;
  const selectedPortfolio =
    portfolios[accounts.findIndex((a) => a.address === selected)];

  const live = useHyperliquidPerp(selected);
  const perp = live.perp;
  const { data: spot } = useQuery({
    queryKey: ["hyperliquid", "spot", selected],
    queryFn: ({ signal }) => fetchSpotBalances(selected, signal),
    refetchInterval: REFRESH_MS,
  });
  const { data: mids } = useQuery({
    queryKey: ["hyperliquid", "mids"],
    queryFn: ({ signal }) => fetchMids(signal),
    refetchInterval: REFRESH_MS,
  });

  const portfolio = selectedPortfolio?.data;
  const series = portfolio?.[portfolioKey(range, scope)];
  const value = currentValue(portfolio);
  const pnl = rangePnl(series);
  const totalValue = portfolios.every((p) => p.data)
    ? portfolios.reduce((sum, p) => sum + (currentValue(p.data) ?? 0), 0)
    : null;
  const failed = selectedPortfolio?.isError;
  const unrealized = totalUnrealized(perp, live.marks);
  const positionCount = perp?.positions.length ?? 0;

  return (
    <div className="@container flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-white/90">
            {failed ? "Hyperliquid is taking a break" : pnlHeadline(pnl, range)}
          </h1>
          <p className="mt-0.5 text-xs text-white/50">
            {failed
              ? "Couldn't reach Hyperliquid. Retrying every minute."
              : positionsSummary(perp, unrealized)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AccountPicker
            accounts={accounts}
            selected={selected}
            onSelect={setSelected}
            accountValue={(a) => currentValue(portfolioOf(a))}
          />
          <IconButton title="Disconnect" onClick={onDisconnect} size="default">
            <LogOut />
          </IconButton>
        </div>
      </header>

      {failed && (
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-white/[0.03] px-4 py-10 text-center ring-1 ring-white/[0.06]">
          <p className="text-sm font-medium text-white/80">Hang tight 🌧</p>
          <p className="max-w-sm text-xs leading-relaxed text-white/45">
            Hyperliquid didn't answer just now. Bessel keeps trying in the
            background, so this page fills in again on its own.
          </p>
        </div>
      )}

      {!failed && (
        <>
          <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
            <StatCard
              icon={Wallet}
              hue={305}
              label="Account value"
              value={value === null ? "—" : formatUsd(value)}
              detail={
                accounts.length > 1 && totalValue !== null
                  ? `${formatUsd(totalValue)} across ${accounts.length} accounts`
                  : "This account"
              }
            />
            <StatCard
              icon={pnl !== null && pnl < 0 ? TrendingDown : TrendingUp}
              hue={pnl !== null && pnl < 0 ? 0 : 160}
              label={`PnL - ${RANGE_LABELS[range].long}`}
              value={
                <span className={pnlTone(pnl)}>
                  {pnl === null ? "—" : formatSignedUsd(pnl)}
                </span>
              }
              detail={scope === "perp" ? "Perps only" : "Perps and spot"}
            />
            <StatCard
              icon={Activity}
              hue={235}
              label={`Volume - ${RANGE_LABELS[range].long}`}
              value={series ? formatVolume(series.volume) : "—"}
              detail="Traded"
            />
            <StatCard
              icon={PiggyBank}
              hue={45}
              label="Withdrawable"
              value={perp ? formatUsd(perp.withdrawable) : "—"}
              detail={
                perp && perp.marginUsed > 0
                  ? `${formatUsd(perp.marginUsed)} margin in use`
                  : "No margin in use"
              }
            />
          </div>

          <section className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-13 font-medium text-white/80">
                {scope === "total" ? "PnL" : "Perps PnL"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  label="Scope"
                  value={scope}
                  onChange={setScope}
                  options={[
                    ["total", "Total"],
                    ["perp", "Perps"],
                  ]}
                />
                <Segmented
                  label="Range"
                  value={range}
                  onChange={setRange}
                  options={RANGES.map((r) => [r, RANGE_LABELS[r].short])}
                />
              </div>
            </div>
            {series ? (
              <PnlChart points={series.pnl} range={range} />
            ) : (
              <Skeleton className="h-64 w-full rounded-xl bg-white/[0.04]" />
            )}
          </section>

          {/* Open positions need the full width; with none, both sections are small. */}
          <div
            className={cn("grid gap-4", !positionCount && "@4xl:grid-cols-2")}
          >
            <section>
              <SectionLabel
                action={<LiveBadge live={live.status === "live"} />}
              >
                <span className="flex items-baseline gap-2">
                  Open positions
                  {positionCount > 0 && (
                    <span className="text-white/35">{positionCount}</span>
                  )}
                  {unrealized !== null && (
                    <span className={cn("tabular-nums", pnlTone(unrealized))}>
                      {formatSignedUsd(unrealized)} unrealized
                    </span>
                  )}
                </span>
              </SectionLabel>
              <PositionsList perp={perp} marks={live.marks} />
            </section>
            <section>
              <SectionLabel>Spot</SectionLabel>
              <SpotList spot={spot} mids={mids} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function positionsSummary(
  perp: { positions: unknown[] } | undefined,
  unrealized: number | null,
): string {
  if (!perp) return "\u00a0";
  const count = perp.positions.length;
  if (count === 0) return "No open positions right now.";
  const noun = count === 1 ? "open position" : "open positions";
  return unrealized === null
    ? `${count} ${noun}.`
    : `${count} ${noun}, ${formatSignedUsd(unrealized)} unrealized right now.`;
}

const PILL =
  "w-auto min-w-0 max-w-full gap-1.5 rounded-full border-0 bg-white/[0.04] px-3 text-xs ring-1 ring-white/[0.06] dark:bg-white/[0.04]";

function AccountPicker({
  accounts,
  selected,
  onSelect,
  accountValue,
}: {
  accounts: SubAccount[];
  selected: string;
  onSelect: (address: string) => void;
  accountValue: (address: string) => number | null;
}) {
  if (accounts.length === 1) {
    return (
      <span className="rounded-full bg-white/[0.04] px-3 py-1.5 font-mono text-11 text-white/55 ring-1 ring-white/[0.06]">
        {shortAddress(selected)}
      </span>
    );
  }
  return (
    <Select value={selected} onValueChange={onSelect}>
      <SelectTrigger aria-label="Account" className={PILL}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account, i) => {
          const value = accountValue(account.address);
          return (
            <SelectItem key={account.address} value={account.address}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{account.name}</span>
                <span className="font-mono text-11 text-white/35">
                  {shortAddress(account.address)}
                </span>
                {value !== null && (
                  <span className="text-11 tabular-nums text-white/45">
                    {formatUsd(value)}
                  </span>
                )}
                {i === 0 && <span className="sr-only">(main)</span>}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
