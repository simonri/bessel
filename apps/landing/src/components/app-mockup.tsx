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
        <span className="text-[10px] font-medium tracking-wide text-white/45">
          {title}
        </span>
        <span className="size-1.5 rounded-full bg-white/10" />
      </div>
      <div className="min-h-0 flex-1 px-3 py-2.5">{children}</div>
    </div>
  );
}

function NextUpWidget() {
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12px] font-medium text-white/90">
            Lunch with Anna
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-[#f97316]">
            in 40 min
          </span>
        </div>
        <span className="text-[10px] text-white/40">12:00 - Pelikan</span>
      </div>
      <div className="flex flex-col gap-0.5 border-t border-white/[0.05] pt-1.5">
        <span className="text-[10px] text-white/60">
          Last seen 3 weeks ago - climbing
        </span>
        <span className="truncate text-[10px] text-white/35">
          &ldquo;Starting the new job in May&rdquo;
        </span>
      </div>
    </div>
  );
}

const TASKS = [
  { label: "Book dentist", due: "Today" },
  { label: "Renew passport", due: "Fri" },
  { label: "Water the plants", due: "Weekly" },
];

function TasksWidget() {
  return (
    <div className="flex h-full flex-col justify-evenly">
      {TASKS.map((task) => (
        <div key={task.label} className="flex items-center gap-2">
          <span className="size-3 shrink-0 rounded-full border border-white/20" />
          <span className="flex-1 truncate text-[10px] text-white/70">
            {task.label}
          </span>
          <span className="text-[9px] text-white/30 max-sm:hidden">
            {task.due}
          </span>
        </div>
      ))}
    </div>
  );
}

function MoneyWidget() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] text-white/45">Spent in October</span>
        <span className="text-[13px] font-medium tabular-nums tracking-tight text-white/90">
          18 240 kr
        </span>
      </div>
      <div className="mt-2 flex flex-1 flex-col justify-evenly">
        {[
          ["Food", 0.62, "6 410 kr"],
          ["Home", 0.45, "4 650 kr"],
          ["Transport", 0.2, "2 080 kr"],
        ].map(([label, share, amount]) => (
          <div key={label as string} className="flex items-center gap-2">
            <span className="w-16 truncate text-[9.5px] text-white/55">
              {label}
            </span>
            <span className="h-1 flex-1 rounded-full bg-white/[0.06]">
              <span
                className="block h-1 rounded-full bg-[#f97316]/70"
                style={{ width: `${(share as number) * 100}%` }}
              />
            </span>
            <span className="text-[9.5px] tabular-nums text-white/50">
              {amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const PEOPLE = [
  { name: "Erik", note: "Turns 40 on Saturday" },
  { name: "Maja", note: "Anything to note from the retro?" },
  { name: "Jonas", note: "Moving to Berlin in May" },
];

function PeopleWidget() {
  return (
    <div className="flex h-full flex-col justify-evenly">
      {PEOPLE.map((person) => (
        <div key={person.name} className="flex items-center gap-2">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[7px] font-semibold text-white/60">
            {person.name[0]}
          </span>
          <span className="text-[10px] text-white/75">{person.name}</span>
          <span className="truncate text-[9.5px] text-white/35 max-sm:hidden">
            {person.note}
          </span>
        </div>
      ))}
    </div>
  );
}

const NIGHTS = [6.9, 7.4, 6.2, 7.8, 7.1, 8.3, 7.5];

function SleepWidget() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[13px] font-medium tabular-nums text-white/90">
          7 h 30 min
        </span>
        <span className="text-[10px] text-white/40">last night</span>
      </div>
      <div className="mt-2 flex flex-1 items-end gap-1">
        {NIGHTS.map((hours, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed week of bars; each is its day
            key={i}
            className={`flex-1 rounded-sm ${i === NIGHTS.length - 1 ? "bg-[#f97316]/70" : "bg-white/[0.1]"}`}
            style={{ height: `${((hours - 5) / 4) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function TerminalWidget() {
  return (
    <div className="flex h-full flex-col gap-1 font-mono text-[10px] leading-relaxed">
      <span className="text-white/30">~/dev/side-project</span>
      <span className="text-white/70">
        <span className="text-[#f97316]">❯</span> claude
      </span>
      <span className="text-white/40">Reading the failing test…</span>
      <span className="text-white/70">
        <span className="text-[#f97316]">❯</span>
        <span className="ml-1 inline-block h-3 w-[7px] translate-y-0.5 animate-pulse bg-[#f97316]" />
      </span>
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
            <span className="text-[10px] tabular-nums text-white/40">
              21:47
            </span>
          </div>

          <div className="grid grid-cols-12 gap-2 p-2 sm:gap-2.5 sm:p-3">
            <MiniWindow
              title="Next up"
              className="col-span-7 h-36 sm:col-span-5"
            >
              <NextUpWidget />
            </MiniWindow>
            <MiniWindow title="Tasks" className="col-span-5 h-36 sm:col-span-4">
              <TasksWidget />
            </MiniWindow>
            <MiniWindow
              title="Sleep"
              className="col-span-6 h-36 max-sm:hidden sm:col-span-3"
            >
              <SleepWidget />
            </MiniWindow>
            <MiniWindow title="Money" className="col-span-7 h-32 sm:col-span-4">
              <MoneyWidget />
            </MiniWindow>
            <MiniWindow
              title="People"
              className="col-span-5 h-32 sm:col-span-4"
            >
              <PeopleWidget />
            </MiniWindow>
            <MiniWindow
              title="Terminal"
              className="col-span-12 h-32 max-sm:hidden sm:col-span-4"
            >
              <TerminalWidget />
            </MiniWindow>
          </div>
        </div>
      </div>
    </div>
  );
}
