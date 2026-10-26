import {
  CalendarDays,
  ChefHat,
  HeartPulse,
  ListChecks,
  MessageSquare,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { BesselMark } from "@/components/logo";

const SOURCES: { icon: ReactNode; name: string; from: string }[] = [
  { icon: <CalendarDays />, name: "Calendar", from: "Google, iCloud" },
  { icon: <Wallet />, name: "Money", from: "Your bank, Klarna, Avanza" },
  { icon: <HeartPulse />, name: "Health", from: "Sleep and workouts" },
  { icon: <ListChecks />, name: "Tasks", from: "Projects and chores" },
  { icon: <Users />, name: "People", from: "Contacts and your notes" },
  { icon: <ChefHat />, name: "Recipes", from: "What you cook" },
];

/** A connecting line: across on wide screens, down on narrow ones. */
function Link() {
  return (
    <span
      aria-hidden
      className="mx-auto h-10 w-px bg-gradient-to-b from-white/5 via-accent/50 to-white/5 lg:mx-0 lg:h-px lg:w-auto lg:flex-1 lg:bg-gradient-to-r"
    />
  );
}

/** A circle with its name under it. On wide screens the name hangs below the
 *  circle without taking up height, so the lines meet each circle's centre. */
function Node({
  name,
  caption,
  className,
  children,
}: {
  name: string;
  caption: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center gap-3 text-center lg:gap-0">
      <span
        className={`flex size-20 items-center justify-center rounded-full border ${className}`}
      >
        {children}
      </span>
      <span className="flex flex-col items-center gap-1 lg:absolute lg:top-full lg:mt-3 lg:w-44">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-xs text-faint-foreground">{caption}</span>
      </span>
    </div>
  );
}

/** Your life's sources flowing through Bessel to Claude. */
export function ContextFlow() {
  return (
    <div className="flex flex-col items-stretch lg:flex-row lg:items-center">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:w-[30rem] lg:shrink-0 lg:grid-cols-2">
        {SOURCES.map((source) => (
          <li
            key={source.name}
            className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-accent [&_svg]:size-4">
              {source.icon}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{source.name}</span>
              <span className="text-xs text-faint-foreground lg:truncate">
                {source.from}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <Link />
      <Node
        name="Bessel"
        caption="Keeps it all up to date"
        className="border-accent/30 bg-accent/[0.08] shadow-[0_0_60px_-10px_rgba(249,115,22,0.45)]"
      >
        <BesselMark className="size-9 text-accent" />
      </Node>
      <Link />
      <Node
        name="Claude"
        caption="Reads it when you ask"
        className="border-white/[0.1] bg-white/[0.04]"
      >
        <MessageSquare className="size-8 text-foreground/80" />
      </Node>
    </div>
  );
}
