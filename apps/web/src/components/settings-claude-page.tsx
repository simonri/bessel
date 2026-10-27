import { listAssistantNotesOptions } from "@bessel/client";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import {
  SettingsError,
  SettingsLoading,
  SettingsRow,
  SettingsSection,
} from "@/components/settings-ui";
import { SoftButton } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";

export function connectorAddress() {
  return `${client.getConfig().baseUrl}/mcp`;
}

export function CopyButton({
  text,
  label,
  ariaLabel,
}: {
  text: string;
  label: string;
  ariaLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <SoftButton
      aria-label={ariaLabel}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </SoftButton>
  );
}

const STEPS = [
  "In Claude, open Settings and then Connectors.",
  "Choose Add custom connector, name it Bessel and paste the address.",
  "Sign in with your Bessel account when Claude asks.",
];

function Connect() {
  const address = connectorAddress();
  const command = `claude mcp add --transport http bessel ${address}`;
  return (
    <SettingsSection
      title="Connect"
      description="Claude can then read your tasks, calendar, contacts, recipes, health and money, and add tasks, recipes and events. It never deletes anything or moves money."
    >
      <SettingsRow
        label="Connector address"
        description={<span className="font-mono">{address}</span>}
      >
        <CopyButton
          text={address}
          label="Copy address"
          ariaLabel="Copy the connector address"
        />
      </SettingsRow>
      <div className="py-3">
        <ol className="space-y-1.5">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-2.5 text-13 text-white/75">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-11 text-white/55 tabular-nums">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
      <SettingsRow
        label="Claude Code"
        description={<span className="font-mono break-all">{command}</span>}
      >
        <CopyButton
          text={command}
          label="Copy command"
          ariaLabel="Copy the Claude Code command"
        />
      </SettingsRow>
    </SettingsSection>
  );
}

function Note({
  noteKey,
  content,
  updatedAt,
}: {
  noteKey: string;
  content: string;
  updatedAt: Date;
}) {
  const [open, setOpen] = useState(false);
  const long = content.split("\n").length > 6 || content.length > 480;
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <h4 className="truncate font-mono text-13 text-white/85">{noteKey}</h4>
        <span className="shrink-0 text-12 text-white/40">
          Updated {formatDistanceToNow(updatedAt, { addSuffix: true })}
        </span>
      </div>
      <p
        className={cn(
          "mt-1.5 whitespace-pre-wrap break-words text-12 leading-relaxed text-white/60",
          long && !open && "line-clamp-6",
        )}
      >
        {content}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-12 text-white/45 transition-colors hover:text-white/80"
        >
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </li>
  );
}

function Memory() {
  const { data, isLoading, isError } = useQuery(
    listAssistantNotesOptions({ client }),
  );
  return (
    <SettingsSection
      title="What Claude remembers"
      description="Notes Claude keeps between conversations, e.g. the morning report's streaks and the suggestions you turned down."
    >
      {isLoading ? (
        <SettingsLoading />
      ) : isError ? (
        <div className="py-3">
          <SettingsError>Couldn't load Claude's notes.</SettingsError>
        </div>
      ) : data?.notes.length ? (
        <ul className="divide-y divide-white/[0.07]">
          {data.notes.map((note) => (
            <Note
              key={note.key}
              noteKey={note.key}
              content={note.content}
              updatedAt={new Date(note.updated_at)}
            />
          ))}
        </ul>
      ) : (
        <p className="py-3 text-13 text-white/45">
          Nothing yet. Notes show up here once a routine like the morning report
          saves something for next time.
        </p>
      )}
    </SettingsSection>
  );
}

/** How to connect Claude to Bessel over MCP, and what it remembers. */
export function ClaudePage() {
  return (
    <div className="space-y-8">
      <Connect />
      <Memory />
    </div>
  );
}
