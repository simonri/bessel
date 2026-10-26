import type { ReactNode } from "react";

function Card({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06] ${className ?? ""}`}
    >
      <h3 className="mb-2.5 text-xs font-medium text-white/55">{title}</h3>
      {children}
    </section>
  );
}

const TASKS = [
  { label: "Book the dentist", due: "Today" },
  { label: "Renew passport", due: "Friday" },
  { label: "Water the plants", due: "Every week" },
];

/** A quiet picture of the app's Today page. */
export function TodayPreview({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101116]/90 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </div>
        <div className="flex flex-col gap-3 p-4 sm:p-6">
          <div>
            <p className="font-serif text-xl font-medium text-white/90">
              Today
            </p>
            <p className="text-xs text-white/45">Monday 26 October</p>
          </div>

          <Card title="Next up">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-white/90">
                Lunch with Anna
              </p>
              <span className="shrink-0 text-xs tabular-nums text-accent">
                in 40 min
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/45">12:00 - Pelikan</p>
            <p className="mt-2.5 text-xs text-white/70">
              Anna Berg
              <span className="text-white/40">
                {" "}
                - last seen 3 weeks ago, climbing
              </span>
            </p>
            <p className="text-xs text-white/45">
              &ldquo;Starting the new job in May&rdquo;
            </p>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card title="Tasks">
              <ul className="flex flex-col gap-2">
                {TASKS.map((task) => (
                  <li
                    key={task.label}
                    className="flex items-center gap-2.5 text-xs"
                  >
                    <span className="size-3.5 shrink-0 rounded-full border border-white/20" />
                    <span className="flex-1 truncate text-white/75">
                      {task.label}
                    </span>
                    <span className="text-white/35">{task.due}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="People">
              <p className="text-xs text-white/75">
                Erik
                <span className="text-white/40"> - turns 40</span>
                <span className="float-right text-accent">Saturday</span>
              </p>
              <p className="mt-2 text-xs text-white/75">
                Anything to note about Maja?
                <span className="text-white/40"> - Retro</span>
              </p>
            </Card>
          </div>

          <Card title="Last night">
            <p className="text-xs text-white/75">7 h 30 min of sleep.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
