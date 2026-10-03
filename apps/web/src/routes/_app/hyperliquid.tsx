import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { Skeleton } from "@bessel/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@bessel/ui/components/toggle-group";
import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, LogOut, Wallet } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  EmptyState,
  IconButton,
  PageToolbar,
  Panel,
  PrimaryButton,
  SectionLabel,
  SoftButton,
  StatTile,
  TextInput,
} from "@/components/ui-kit";
import { useSettings } from "@/hooks/use-settings";
import {
  currentValue,
  explorerUrl,
  fetchMids,
  fetchPerpState,
  fetchPortfolio,
  fetchSpotBalances,
  fetchSubAccounts,
  type PerpState,
  type Point,
  type Portfolio,
  parseAddress,
  portfolioKey,
  RANGES,
  type Range,
  rangePnl,
  type Scope,
  type SpotBalance,
  type SubAccount,
  shortAddress,
  spotValue,
} from "@/lib/hyperliquid";
import { cn } from "@/lib/utils";
import {
  axisUsdFormatter,
  formatAmount,
  formatPercent,
  formatPrice,
  formatSignedUsd,
  formatTick,
  formatTime,
  formatUsd,
  formatVolume,
  pnlTone,
  RANGE_LABELS,
  timeTicks,
  valueAxis,
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
    <EmptyState icon={<Wallet />} title="Connect a Hyperliquid account">
      <form
        onSubmit={submit}
        className="mx-auto mt-2 w-full max-w-md space-y-3"
      >
        <p>
          Paste your wallet address or a Hypurrscan link. It's read-only:
          Hyperliquid account data is public, and the address is only saved in
          this browser.
        </p>
        <div className="flex gap-2">
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
        {error && <p className="text-left text-12 text-red-400">{error}</p>}
      </form>
    </EmptyState>
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
  const [range, setRange] = useState<Range>("week");
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

  const { data: perp } = useQuery({
    queryKey: ["hyperliquid", "perp", selected],
    queryFn: ({ signal }) => fetchPerpState(selected, signal),
    refetchInterval: REFRESH_MS,
  });
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

  return (
    <div className="@container space-y-4">
      <PageToolbar
        description={
          <AccountPicker
            accounts={accounts}
            selected={selected}
            onSelect={setSelected}
            accountValue={(a) => currentValue(portfolioOf(a))}
          />
        }
      >
        <SoftButton
          onClick={() =>
            window.open(explorerUrl(selected), "_blank", "noopener,noreferrer")
          }
        >
          <ExternalLink />
          Hypurrscan
        </SoftButton>
        <IconButton title="Disconnect" onClick={onDisconnect} size="default">
          <LogOut />
        </IconButton>
      </PageToolbar>

      {failed ? (
        <EmptyState title="Couldn't reach Hyperliquid">
          Retrying every minute.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
            <StatTile
              label="Account value"
              value={value === null ? "—" : formatUsd(value)}
              hint={
                accounts.length > 1 && totalValue !== null
                  ? `${formatUsd(totalValue)} across ${accounts.length} accounts`
                  : undefined
              }
            />
            <StatTile
              label={`PnL · ${RANGE_LABELS[range].long}`}
              value={
                <span className={pnlTone(pnl)}>
                  {pnl === null ? "—" : formatSignedUsd(pnl)}
                </span>
              }
              hint={scope === "perp" ? "Perps only" : undefined}
            />
            <StatTile
              label={`Volume · ${RANGE_LABELS[range].long}`}
              value={series ? formatVolume(series.volume) : "—"}
            />
            <StatTile
              label="Withdrawable"
              value={perp ? formatUsd(perp.withdrawable) : "—"}
              hint={
                perp && perp.marginUsed > 0
                  ? `${formatUsd(perp.marginUsed)} margin in use`
                  : undefined
              }
            />
          </div>

          <Panel className="divide-y-0 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-13 font-medium text-white/80">
                {scope === "total" ? "PnL" : "Perps PnL"}
              </p>
              <div className="flex items-center gap-2">
                <Toggle
                  label="Scope"
                  value={scope}
                  onChange={setScope}
                  options={[
                    ["total", "Total"],
                    ["perp", "Perps"],
                  ]}
                />
                <Toggle
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
              <Skeleton className="h-64 w-full bg-white/[0.04]" />
            )}
          </Panel>

          {accounts.length > 1 && (
            <Accounts
              accounts={accounts}
              selected={selected}
              onSelect={setSelected}
              accountValue={(a) => currentValue(portfolioOf(a))}
            />
          )}

          <div className="grid gap-4 @4xl:grid-cols-2">
            <Positions perp={perp} />
            <SpotBalances spot={spot} mids={mids} />
          </div>
        </>
      )}
    </div>
  );
}

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
      <span className="font-mono text-12 text-white/60">
        {shortAddress(selected)}
      </span>
    );
  }
  return (
    <Select value={selected} onValueChange={onSelect}>
      <SelectTrigger
        aria-label="Account"
        className="w-auto max-w-full min-w-0 border-white/10 bg-white/[0.04]"
      >
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

function Accounts({
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
  return (
    <section>
      <SectionLabel
        action={
          <span className="text-11 text-white/35">{accounts.length}</span>
        }
      >
        Accounts
      </SectionLabel>
      <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @4xl:grid-cols-4">
        {accounts.map((account, i) => {
          const value = accountValue(account.address);
          const active = account.address === selected;
          return (
            <button
              key={account.address}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(account.address)}
              className={cn(
                "min-w-0 rounded-xl border px-3.5 py-3 text-left outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-white/25",
                active
                  ? "border-primary-500/40 bg-primary-500/[0.08]"
                  : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05]",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-12 font-medium text-white/80">
                  {account.name}
                </span>
                {i === 0 && (
                  <span className="shrink-0 text-10 text-white/35">Main</span>
                )}
              </span>
              <span className="mt-1 block text-15 font-semibold tabular-nums text-white/90">
                {value === null ? "—" : formatUsd(value)}
              </span>
              <span className="block font-mono text-10 text-white/35">
                {shortAddress(account.address)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Toggle<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
}) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      variant="outline"
      size="sm"
    >
      {options.map(([key, text]) => (
        <ToggleGroupItem
          key={key}
          value={key}
          className="border-white/10 px-2.5 text-12 text-white/55 hover:bg-white/[0.06] hover:text-white/85 data-[state=on]:bg-white/[0.12] data-[state=on]:text-white"
        >
          {text}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const LINE = "var(--color-primary-400)";
const TICK = { fill: "rgb(255 255 255 / 0.4)", fontSize: 11 };

function PnlChart({ points, range }: { points: Point[]; range: Range }) {
  if (points.length < 2) {
    return (
      <p className="flex h-64 items-center justify-center text-12 text-white/40">
        No history for this range yet.
      </p>
    );
  }
  const axis = valueAxis(points.map((p) => p.value));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart
          data={points}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
        >
          <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.06)" />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            ticks={timeTicks(points[0].ts, points[points.length - 1].ts, range)}
            tickFormatter={(ts: number) => formatTick(ts, range)}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={TICK}
            tickMargin={8}
          />
          <YAxis
            dataKey="value"
            domain={axis.domain}
            ticks={axis.ticks}
            tickFormatter={axisUsdFormatter(axis.ticks)}
            tickLine={false}
            axisLine={false}
            width={64}
            tick={TICK}
          />
          <Tooltip
            cursor={{ stroke: "rgb(255 255 255 / 0.25)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as Point | undefined;
              if (!active || !point) return null;
              return (
                <div className="rounded-md border border-white/10 bg-popover px-2.5 py-1.5 text-11 shadow-lg">
                  <p className="text-white/50">
                    {formatTime(point.ts, range, true)}
                  </p>
                  <p
                    className={cn(
                      "font-medium tabular-nums",
                      pnlTone(point.value),
                    )}
                  >
                    {formatSignedUsd(point.value)}
                  </p>
                </div>
              );
            }}
          />
          <ReferenceLine
            y={0}
            stroke="rgb(255 255 255 / 0.25)"
            strokeDasharray="3 3"
          />
          <Area
            dataKey="value"
            type="monotone"
            baseValue={0}
            stroke={LINE}
            strokeWidth={2}
            fill={LINE}
            fillOpacity={0.1}
            isAnimationActive={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Positions({ perp }: { perp: PerpState | undefined }) {
  return (
    <section>
      <SectionLabel
        action={
          perp && perp.positions.length > 0 ? (
            <span className="text-11 text-white/35">
              {perp.positions.length}
            </span>
          ) : undefined
        }
      >
        Positions
      </SectionLabel>
      <Panel>
        {!perp ? (
          <Skeleton className="m-3 h-16 bg-white/[0.04]" />
        ) : perp.positions.length === 0 ? (
          <p className="px-4 py-6 text-center text-12 text-white/40">
            No open positions.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-12">
              <thead>
                <tr className="text-left text-11 text-white/40">
                  <th className="px-4 py-2 font-medium">Coin</th>
                  <th className="px-2 py-2 text-right font-medium">Size</th>
                  <th className="px-2 py-2 text-right font-medium">Value</th>
                  <th className="px-2 py-2 text-right font-medium">Entry</th>
                  <th className="px-2 py-2 text-right font-medium">Liq.</th>
                  <th className="px-4 py-2 text-right font-medium">PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] tabular-nums">
                {perp.positions.map((p) => (
                  <tr key={p.coin}>
                    <td className="px-4 py-2">
                      <span className="font-medium text-white/85">
                        {p.coin}
                      </span>
                      <span
                        className={cn(
                          "ml-1.5 text-11",
                          p.size >= 0
                            ? "text-emerald-400/80"
                            : "text-red-400/80",
                        )}
                      >
                        {p.size >= 0 ? "Long" : "Short"} {p.leverage}×
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-white/70">
                      {formatAmount(Math.abs(p.size))}
                    </td>
                    <td className="px-2 py-2 text-right text-white/70">
                      {formatUsd(p.value)}
                    </td>
                    <td className="px-2 py-2 text-right text-white/55">
                      {formatPrice(p.entryPrice)}
                    </td>
                    <td className="px-2 py-2 text-right text-white/55">
                      {p.liquidationPrice === null
                        ? "—"
                        : formatPrice(p.liquidationPrice)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right",
                        pnlTone(p.unrealizedPnl),
                      )}
                    >
                      {formatSignedUsd(p.unrealizedPnl)}
                      <span className="ml-1 text-11 opacity-70">
                        {formatPercent(p.returnOnEquity)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}

function SpotBalances({
  spot,
  mids,
}: {
  spot: SpotBalance[] | undefined;
  mids: Record<string, number> | undefined;
}) {
  const rows = (spot ?? [])
    .map((balance) => ({ balance, value: spotValue(balance, mids) }))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <section>
      <SectionLabel>Spot balances</SectionLabel>
      <Panel>
        {!spot ? (
          <Skeleton className="m-3 h-16 bg-white/[0.04]" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-12 text-white/40">
            No spot balances.
          </p>
        ) : (
          rows.map(({ balance, value }) => (
            <div
              key={balance.coin}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-12"
            >
              <span className="font-medium text-white/85">{balance.coin}</span>
              <span className="min-w-0 text-right tabular-nums">
                <span className="text-white/80">
                  {value === null ? "—" : formatUsd(value)}
                </span>
                <span className="block text-11 text-white/40">
                  {formatAmount(balance.total)}
                  {balance.hold > 0 && ` · ${formatAmount(balance.hold)} held`}
                </span>
              </span>
            </div>
          ))
        )}
      </Panel>
    </section>
  );
}
