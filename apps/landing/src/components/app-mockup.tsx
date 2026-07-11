import type { ReactNode } from "react";

function MiniWindow({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-white/[0.07] bg-[#16171c]/90 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-1.5">
        <span className="text-[10px] font-medium tracking-wide text-white/45">{title}</span>
        <span className="size-1.5 rounded-full bg-white/10" />
      </div>
      <div className="min-h-0 flex-1 px-3 py-2.5">{children}</div>
    </div>
  );
}

function NetWorthWidget() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-medium tracking-tight text-white/90">$128,410</span>
        <span className="text-[10px] font-medium text-emerald-400/90">+2.4%</span>
      </div>
      <svg viewBox="0 0 200 56" preserveAspectRatio="none" className="mt-2 w-full flex-1">
        <defs>
          <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 44 C18 41 28 46 44 39 C60 32 70 36 86 29 C102 22 114 30 130 21 C146 13 160 19 176 11 L200 8 L200 56 L0 56 Z"
          fill="url(#nw-fill)"
        />
        <path
          d="M0 44 C18 41 28 46 44 39 C60 32 70 36 86 29 C102 22 114 30 130 21 C146 13 160 19 176 11 L200 8"
          fill="none"
          stroke="#f97316"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

const TRANSACTIONS = [
  { name: "Blue Bottle", category: "Coffee", amount: "−$6.40", positive: false },
  { name: "ICA Kvantum", category: "Groceries", amount: "−$54.20", positive: false },
  { name: "Salary", category: "Income", amount: "+$4,850", positive: true },
  { name: "Vanguard", category: "Transfer", amount: "−$500.00", positive: false },
];

function TransactionsWidget() {
  return (
    <div className="flex h-full flex-col justify-between py-0.5">
      {TRANSACTIONS.map((tx) => (
        <div key={tx.name} className="flex items-center gap-2">
          <span className="flex size-4 items-center justify-center rounded-full bg-white/[0.07] text-[7px] font-semibold text-white/60">
            {tx.name[0]}
          </span>
          <span className="flex-1 truncate text-[10px] text-white/70">{tx.name}</span>
          <span className="hidden text-[9px] text-white/30 lg:block">{tx.category}</span>
          <span
            className={`text-[10px] tabular-nums ${tx.positive ? "text-emerald-400/90" : "text-white/60"}`}
          >
            {tx.amount}
          </span>
        </div>
      ))}
    </div>
  );
}

function TerminalWidget() {
  return (
    <div className="flex h-full flex-col gap-1 font-mono text-[10px] leading-relaxed">
      <span className="text-white/30">~/dev/metron on master</span>
      <span className="text-white/70">
        <span className="text-[#f97316]">❯</span> uv run task api
      </span>
      <span className="text-white/40">INFO Uvicorn running on 127.0.0.1:8100</span>
      <span className="text-white/70">
        <span className="text-[#f97316]">❯</span>
        <span className="ml-1 inline-block h-3 w-[7px] translate-y-0.5 animate-pulse bg-[#f97316]" />
      </span>
    </div>
  );
}

const GIT_FILES = [
  { status: "M", color: "text-amber-400/90", path: "src/api/service.py" },
  { status: "A", color: "text-emerald-400/90", path: "widgets/terminal.tsx" },
  { status: "M", color: "text-amber-400/90", path: "canvas/layout.ts" },
];

function GitWidget() {
  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-white/70">master</span>
        <span className="text-white/30">↑2</span>
        <span className="ml-auto text-emerald-400/80">+12</span>
        <span className="text-red-400/80">−4</span>
      </div>
      {GIT_FILES.map((file) => (
        <div key={file.path} className="flex items-center gap-2 font-mono text-[9.5px]">
          <span className={file.color}>{file.status}</span>
          <span className="truncate text-white/50">{file.path}</span>
        </div>
      ))}
    </div>
  );
}

const TASKS = [
  { done: true, label: "Ship landing page" },
  { done: false, label: "Import Q3 statements" },
  { done: false, label: "Plan Lisbon trip" },
];

function TasksWidget() {
  return (
    <div className="flex h-full flex-col justify-evenly">
      {TASKS.map((task) => (
        <div key={task.label} className="flex items-center gap-2">
          <span
            className={`flex size-3 items-center justify-center rounded-[4px] border text-[7px] ${
              task.done
                ? "border-[#f97316]/60 bg-[#f97316]/20 text-[#f97316]"
                : "border-white/20"
            }`}
          >
            {task.done ? "✓" : ""}
          </span>
          <span
            className={`text-[10px] ${task.done ? "text-white/35 line-through" : "text-white/70"}`}
          >
            {task.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// Deterministic pseudo-random intensity for the activity heatmap
function cellAlpha(i: number) {
  const v = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  return v < 0.6 ? 0 : (v - 0.6) * 1.4;
}

function ActivityWidget() {
  return (
    <div className="grid h-full grid-cols-14 content-center gap-[3px]">
      {Array.from({ length: 70 }, (_, i) => {
        const alpha = cellAlpha(i);
        return (
          <span
            key={i}
            className="aspect-square rounded-[2px]"
            style={{
              backgroundColor:
                alpha === 0 ? "rgba(255,255,255,0.04)" : `rgba(249,115,22,${(0.15 + alpha * 0.6).toFixed(2)})`,
            }}
          />
        );
      })}
    </div>
  );
}

export function AppMockup({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative">
        <div
          aria-hidden
          className="absolute -inset-x-16 -top-16 -bottom-8 rounded-[50%] bg-[#f97316]/[0.07] blur-3xl"
        />
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#101116]/80 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
            </div>
            <div className="mx-auto flex gap-1">
              {["1", "2", "3"].map((ws) => (
                <span
                  key={ws}
                  className={`flex size-5 items-center justify-center rounded text-[9px] ${
                    ws === "1" ? "bg-white/10 text-white/80" : "text-white/30"
                  }`}
                >
                  {ws}
                </span>
              ))}
            </div>
            <span className="text-[10px] tabular-nums text-white/40">21:47</span>
          </div>

          <div className="grid grid-cols-12 gap-2 p-2 sm:gap-2.5 sm:p-3">
            <MiniWindow title="Net worth" className="col-span-7 h-36 sm:col-span-5">
              <NetWorthWidget />
            </MiniWindow>
            <MiniWindow title="Terminal" className="col-span-5 h-36 sm:col-span-4">
              <TerminalWidget />
            </MiniWindow>
            <MiniWindow title="Tasks" className="col-span-6 h-36 max-sm:hidden sm:col-span-3">
              <TasksWidget />
            </MiniWindow>
            <MiniWindow title="Transactions" className="col-span-7 h-32 sm:col-span-4">
              <TransactionsWidget />
            </MiniWindow>
            <MiniWindow title="metron.git" className="col-span-5 h-32 sm:col-span-4">
              <GitWidget />
            </MiniWindow>
            <MiniWindow title="Activity" className="col-span-12 h-32 max-sm:hidden sm:col-span-4">
              <ActivityWidget />
            </MiniWindow>
          </div>
        </div>
      </div>
    </div>
  );
}
