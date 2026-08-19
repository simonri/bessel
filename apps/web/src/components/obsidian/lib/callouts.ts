import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Flame,
  HelpCircle,
  Info,
  ListChecks,
  type LucideIcon,
  Pencil,
  Quote,
  XCircle,
  Zap,
} from "lucide-react";

export interface CalloutStyle {
  icon: LucideIcon;
  /** Tailwind classes for the icon + accent border/background. */
  className: string;
}

const DEFAULT_STYLE: CalloutStyle = {
  icon: Pencil,
  className: "text-primary border-primary/30 bg-primary/10",
};

// Obsidian's built-in callout types, grouped by their documented aliases.
const STYLES: Record<string, CalloutStyle> = {
  note: DEFAULT_STYLE,
  abstract: {
    icon: ListChecks,
    className: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
  },
  summary: {
    icon: ListChecks,
    className: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
  },
  tldr: {
    icon: ListChecks,
    className: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
  },
  info: {
    icon: Info,
    className: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  },
  todo: {
    icon: CheckCircle2,
    className: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  },
  tip: {
    icon: Zap,
    className: "text-teal-400 border-teal-400/30 bg-teal-400/10",
  },
  hint: {
    icon: Zap,
    className: "text-teal-400 border-teal-400/30 bg-teal-400/10",
  },
  important: {
    icon: Zap,
    className: "text-teal-400 border-teal-400/30 bg-teal-400/10",
  },
  success: {
    icon: CheckCircle2,
    className: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  },
  check: {
    icon: CheckCircle2,
    className: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  },
  done: {
    icon: CheckCircle2,
    className: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  },
  question: {
    icon: HelpCircle,
    className: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  },
  help: {
    icon: HelpCircle,
    className: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  },
  faq: {
    icon: HelpCircle,
    className: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  },
  warning: {
    icon: AlertTriangle,
    className: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  },
  caution: {
    icon: AlertTriangle,
    className: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  },
  attention: {
    icon: AlertTriangle,
    className: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  },
  failure: {
    icon: XCircle,
    className: "text-red-400 border-red-400/30 bg-red-400/10",
  },
  fail: {
    icon: XCircle,
    className: "text-red-400 border-red-400/30 bg-red-400/10",
  },
  missing: {
    icon: XCircle,
    className: "text-red-400 border-red-400/30 bg-red-400/10",
  },
  danger: {
    icon: Flame,
    className: "text-red-400 border-red-400/30 bg-red-400/10",
  },
  error: {
    icon: Flame,
    className: "text-red-400 border-red-400/30 bg-red-400/10",
  },
  bug: {
    icon: Bug,
    className: "text-pink-400 border-pink-400/30 bg-pink-400/10",
  },
  example: {
    icon: ListChecks,
    className: "text-violet-400 border-violet-400/30 bg-violet-400/10",
  },
  quote: { icon: Quote, className: "text-white/60 border-white/20 bg-white/5" },
  cite: { icon: Quote, className: "text-white/60 border-white/20 bg-white/5" },
};

/** Icon + accent classes for a callout `type` (case-insensitive), with a sane default. */
export function calloutStyle(type: string): CalloutStyle {
  return STYLES[type.toLowerCase()] ?? DEFAULT_STYLE;
}
