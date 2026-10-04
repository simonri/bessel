import type { ProjectSchema } from "@bessel/client";
import { Checkbox } from "@bessel/ui/components/checkbox";
import {
  GlassDialog,
  GlassDialogContent,
  GlassDialogDescription,
  GlassDialogTitle,
} from "@bessel/ui/components/glass-dialog";
import { Spinner } from "@bessel/ui/components/spinner";
import {
  Bookmark,
  ChevronRight,
  Clock,
  CornerDownLeft,
  Folder,
  FolderPlus,
  Laptop,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { folderName, useProjectMutations } from "@/hooks/use-project-mutations";
import { useProjects } from "@/hooks/use-projects";
import { client } from "@/lib/client";
import { isDesktop } from "@/lib/environment";
import { cn } from "@/lib/utils";
import { explainSshError, rawSshError } from "./ssh-errors";

type Step =
  | { kind: "start" }
  | { kind: "connecting"; host: string }
  | { kind: "failed"; host: string; error: unknown }
  | { kind: "browse"; host: string; cwd: string; dirs: string[] };

const SLOW_CONNECT_MS = 5000;

const INPUT =
  "h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-13 text-white/90 outline-none transition-colors duration-150 placeholder:text-white/30 focus:border-primary-500/50";
const ROW =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-13 text-white/80 transition-colors duration-150 hover:bg-white/[0.05]";
const SECONDARY_BUTTON =
  "flex h-8 items-center gap-1.5 rounded-lg px-3 text-13 text-white/55 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/85 disabled:pointer-events-none disabled:opacity-40";
const PRIMARY_BUTTON =
  "flex h-8 items-center gap-1.5 rounded-lg bg-primary-500 px-3.5 text-13 font-medium text-white transition-colors duration-150 hover:bg-primary-400 disabled:pointer-events-none disabled:opacity-40";

const isMac = () =>
  typeof window !== "undefined" && window.electron?.platform === "darwin";

function Hint({ children }: { children: ReactNode }) {
  return (
    <span className="text-11 font-normal text-current opacity-60">
      {children}
    </span>
  );
}

function Header({
  title,
  step,
  description,
}: {
  title: string;
  step?: number;
  description?: ReactNode;
}) {
  return (
    <div className="px-5 pt-4 pb-3 pr-12">
      <GlassDialogTitle className="flex items-baseline gap-2">
        {title}
        {step && (
          <span className="text-13 font-normal text-white/40">
            Step {step} of 3
          </span>
        )}
      </GlassDialogTitle>
      <GlassDialogDescription
        className={cn("mt-1 text-13 text-white/50", !description && "sr-only")}
      >
        {description ?? title}
      </GlassDialogDescription>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-2.5">
      {children}
    </div>
  );
}

/** Recent servers first (from existing projects), then the SSH config's. */
function useSshHosts(): {
  hosts: { host: string; recent: boolean }[];
  configExists: boolean;
} {
  const { data: projects } = useProjects();
  const [configured, setConfigured] = useState<string[]>([]);
  const [configExists, setConfigExists] = useState(false);

  useEffect(() => {
    let alive = true;
    window.electron?.ssh
      .hosts()
      .then((result) => {
        if (!alive) return;
        setConfigured(result.hosts);
        setConfigExists(result.configExists);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const recent = [
    ...new Set(
      (projects ?? []).map((p) => p.ssh_host).filter((h): h is string => !!h),
    ),
  ];
  return {
    hosts: [
      ...recent.map((host) => ({ host, recent: true })),
      ...configured
        .filter((host) => !recent.includes(host))
        .map((host) => ({ host, recent: false })),
    ],
    configExists,
  };
}

function StartStep({
  creating,
  onLocal,
  onConnect,
}: {
  creating: boolean;
  onLocal: () => void;
  onConnect: (host: string) => void;
}) {
  const { hosts, configExists } = useSshHosts();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const trimmed = query.trim();
  const shown = hosts.filter((h) =>
    h.host.toLowerCase().includes(trimmed.toLowerCase()),
  );
  const highlighted = shown[highlight]?.host;

  return (
    <>
      <Header
        title="New project"
        description="A folder you work in. Claude, terminals and git open there."
      />
      <div className="flex flex-col gap-4 px-5 pb-4">
        <button
          type="button"
          onClick={onLocal}
          disabled={creating}
          className="flex items-center gap-3 rounded-xl bg-white/[0.05] p-3 text-left ring-1 ring-white/[0.08] transition-colors duration-150 hover:bg-white/[0.08] disabled:opacity-50"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-500/15 text-primary-300">
            <Laptop className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-13 font-medium text-white/90">
              On this computer
            </span>
            <span className="block text-12 text-white/50">Choose a folder</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-white/30" />
        </button>

        <div className="flex flex-col gap-2">
          <p className="text-12 text-white/45">Or on a server over SSH</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const host = highlighted ?? trimmed;
              if (host) onConnect(host);
            }}
          >
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((i) => Math.min(i + 1, shown.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((i) => Math.max(i - 1, -1));
                }
              }}
              placeholder="Server name, like vps or user@host"
              aria-label="Server"
              spellCheck={false}
              autoCapitalize="off"
              className={INPUT}
            />
            <button
              type="submit"
              disabled={!highlighted && !trimmed}
              className={cn(SECONDARY_BUTTON, "bg-white/[0.05]")}
            >
              Connect
              <CornerDownLeft className="size-3 opacity-60" />
            </button>
          </form>
          {shown.length > 0 && (
            <div className="-mx-2.5 max-h-56 overflow-y-auto">
              {shown.map(({ host, recent }, i) => (
                <button
                  key={host}
                  type="button"
                  onClick={() => onConnect(host)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(ROW, i === highlight && "bg-white/[0.05]")}
                >
                  {recent ? (
                    <Clock className="size-3.5 shrink-0 text-white/40" />
                  ) : (
                    <Bookmark className="size-3.5 shrink-0 text-white/40" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{host}</span>
                  {recent && (
                    <span className="text-12 text-white/35">Recent</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer>
        <p className="px-2 text-12 text-white/40">
          Signs in with your SSH keys. Password logins aren't supported.
        </p>
        {configExists && (
          <button
            type="button"
            onClick={() =>
              window.electron?.ssh
                .openConfig()
                .catch(() => toast.error("Couldn't open your SSH config"))
            }
            className={cn(SECONDARY_BUTTON, "shrink-0 text-primary-300")}
          >
            Open SSH config
          </button>
        )}
      </Footer>
    </>
  );
}

function ConnectingStep({
  host,
  error,
  onBack,
  onRetry,
}: {
  host: string;
  error: unknown | null;
  onBack: () => void;
  onRetry: () => void;
}) {
  const [slow, setSlow] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (error) return;
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SLOW_CONNECT_MS);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    <>
      <Header
        title={error ? "Couldn't connect" : "Connecting"}
        step={2}
        description={error ? undefined : `Connecting to ${host}…`}
      />
      <div className="min-h-32 px-5 pb-5">
        {error ? (
          <div className="flex flex-col gap-2">
            <p className="text-13 leading-relaxed text-white/80">
              {explainSshError(error, host)}
            </p>
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="w-fit text-12 text-white/45 transition-colors hover:text-white/75"
            >
              {showDetails ? "Hide details" : "Show details"}
            </button>
            {showDetails && (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 font-mono text-11 leading-relaxed text-white/60">
                {rawSshError(error)}
              </pre>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 pt-2 text-13 text-white/60">
            <Spinner className="size-4 text-white/50" />
            {slow
              ? "Still waiting for an answer. This can take up to 30 seconds."
              : "Signing in…"}
          </div>
        )}
      </div>
      <Footer>
        <button type="button" onClick={onBack} className={SECONDARY_BUTTON}>
          {error ? "Back" : "Cancel"} <Hint>Esc</Hint>
        </button>
        {error ? (
          <button type="button" onClick={onRetry} className={PRIMARY_BUTTON}>
            Try again
          </button>
        ) : null}
      </Footer>
    </>
  );
}

function Breadcrumb({
  host,
  cwd,
  onNavigate,
}: {
  host: string;
  cwd: string;
  onNavigate: (path: string) => void;
}) {
  const parts = cwd.split("/").filter(Boolean);
  return (
    <>
      <button
        type="button"
        onClick={() => onNavigate("~")}
        title="Home folder"
        className="shrink-0 rounded px-1 text-primary-300 transition-colors hover:bg-white/[0.06]"
      >
        {host}
      </button>
      <span className="shrink-0 text-white/25">:</span>
      <button
        type="button"
        onClick={() => onNavigate("/")}
        className="shrink-0 rounded px-1 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/85"
      >
        /
      </button>
      {parts.map((part, i) => (
        <span
          key={parts.slice(0, i + 1).join("/")}
          className="flex min-w-0 shrink items-center"
        >
          <button
            type="button"
            onClick={() => onNavigate(`/${parts.slice(0, i + 1).join("/")}`)}
            className={cn(
              "min-w-0 truncate rounded px-1 transition-colors hover:bg-white/[0.06]",
              i === parts.length - 1
                ? "text-white/85"
                : "text-white/55 hover:text-white/85",
            )}
          >
            {part}
          </button>
          {i < parts.length - 1 && <span className="text-white/25">/</span>}
        </span>
      ))}
    </>
  );
}

function BrowseStep({
  host,
  cwd,
  dirs,
  busy,
  error,
  newFolder,
  onNewFolderChange,
  onCreateFolder,
  onNavigate,
  onBack,
  onOpen,
}: {
  host: string;
  cwd: string;
  dirs: string[];
  busy: boolean;
  error: string | null;
  newFolder: string | null;
  onNewFolderChange: (name: string | null) => void;
  onCreateFolder: (name: string) => void;
  onNavigate: (path: string) => void;
  onBack: () => void;
  onOpen: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);
  const hiddenId = useId();

  // Moving to another folder clears the filter typed for the last one.
  useEffect(() => {
    setFilter("");
    filterRef.current?.focus();
  }, [cwd]);

  const needle = filter.trim().toLowerCase();
  const shown = dirs.filter(
    (d) =>
      (showHidden || !d.startsWith(".") || needle.startsWith(".")) &&
      d.toLowerCase().includes(needle),
  );
  const hiddenCount = dirs.filter((d) => d.startsWith(".")).length;
  const join = (name: string) => (cwd === "/" ? `/${name}` : `${cwd}/${name}`);

  return (
    <>
      <Header title="Select folder" step={3} />
      <div className="flex flex-col gap-2 px-5">
        <div className="flex min-w-0 items-center gap-0.5 text-13">
          <Breadcrumb host={host} cwd={cwd} onNavigate={onNavigate} />
          <span className="shrink-0 px-0.5 text-white/25">/</span>
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              const typed = filter.trim();
              if (typed.startsWith("/") || typed.startsWith("~"))
                onNavigate(typed);
              else if (shown.length === 1) onNavigate(join(shown[0]));
            }}
            placeholder="Filter, or type a path…"
            aria-label="Filter folders"
            spellCheck={false}
            className="min-w-24 flex-1 bg-transparent text-white/85 outline-none placeholder:text-white/30"
          />
        </div>
        <div className="flex items-center justify-between">
          {hiddenCount > 0 ? (
            <div className="flex items-center gap-2 text-12 text-white/50">
              <Checkbox
                id={hiddenId}
                checked={showHidden}
                onCheckedChange={(v) => setShowHidden(v === true)}
              />
              <label htmlFor={hiddenId} className="cursor-pointer">
                Show hidden folders
              </label>
            </div>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => onNewFolderChange("")}
            className={cn(SECONDARY_BUTTON, "h-7 px-2 text-12")}
          >
            <FolderPlus className="size-3.5" />
            New folder
          </button>
        </div>
      </div>

      <div className="relative mx-3 mt-1 h-72 overflow-y-auto">
        {newFolder !== null && (
          <form
            className={cn(ROW, "bg-white/[0.05] hover:bg-white/[0.05]")}
            onSubmit={(e) => {
              e.preventDefault();
              if (newFolder.trim()) onCreateFolder(newFolder.trim());
            }}
          >
            <FolderPlus className="size-3.5 shrink-0 text-white/45" />
            <input
              // biome-ignore lint/a11y/noAutofocus: the user just asked for this input
              autoFocus
              value={newFolder}
              onChange={(e) => onNewFolderChange(e.target.value)}
              placeholder="Folder name"
              aria-label="New folder name"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-white/90 outline-none placeholder:text-white/30"
            />
            <span className="text-11 text-white/35">Enter to create</span>
          </form>
        )}
        {error && (
          <p className="px-2.5 py-2 text-13 text-amber-300/85">{error}</p>
        )}
        {shown.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onNavigate(join(d))}
            className={cn(ROW, d.startsWith(".") && "text-white/45")}
          >
            <Folder className="size-3.5 shrink-0 text-white/40" />
            <span className="min-w-0 flex-1 truncate">{d}</span>
          </button>
        ))}
        {shown.length === 0 && !error && (
          <p className="px-2.5 py-2 text-13 text-white/40">
            {needle ? "No folders match" : "No folders here"}
          </p>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-popover/60">
            <Spinner className="size-4 text-white/50" />
          </div>
        )}
      </div>

      <Footer>
        <button type="button" onClick={onBack} className={SECONDARY_BUTTON}>
          Back <Hint>Esc</Hint>
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 truncate text-12 text-white/40">
            {folderName(cwd) || "/"}
          </span>
          <button
            type="button"
            onClick={onOpen}
            disabled={busy}
            className={PRIMARY_BUTTON}
          >
            Open <Hint>{isMac() ? "⌘↵" : "Ctrl ↵"}</Hint>
          </button>
        </div>
      </Footer>
    </>
  );
}

/** Without the desktop app there's no picker or SSH: type the path. */
function WebStart({
  creating,
  onCreate,
}: {
  creating: boolean;
  onCreate: (path: string) => void;
}) {
  const [path, setPath] = useState("");
  return (
    <>
      <Header
        title="New project"
        description="A folder you work in. Claude, terminals and git open there."
      />
      <form
        className="flex gap-2 px-5 pb-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (path.trim()) onCreate(path.trim());
        }}
      >
        <input
          // biome-ignore lint/a11y/noAutofocus: the dialog's only field
          autoFocus
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/home/you/code/project"
          aria-label="Folder path"
          className={INPUT}
        />
        <button
          type="submit"
          disabled={!path.trim() || creating}
          className={PRIMARY_BUTTON}
        >
          Add
        </button>
      </form>
    </>
  );
}

/**
 * Adds a project: a folder on this computer through the system picker, or
 * one on a server in three steps (pick the server, connect, pick a folder).
 */
export function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (project: ProjectSchema) => void;
}) {
  const { createProject } = useProjectMutations();
  const [step, setStep] = useState<Step>({ kind: "start" });
  const [busy, setBusy] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  // Every SSH request takes a ticket; a reply whose ticket is no longer
  // current (the user went back or moved on) is ignored.
  const ticket = useRef(0);

  useEffect(() => {
    if (!open) return;
    ticket.current++;
    setStep({ kind: "start" });
    setBusy(false);
    setBrowseError(null);
    setNewFolder(null);
  }, [open]);

  const create = (path: string, sshHost: string | null) => {
    const name = folderName(path) || path;
    createProject.mutate(
      { client, body: { name, path, ssh_host: sshHost } },
      {
        onSuccess: (project) => {
          onOpenChange(false);
          toast.success(`Added “${project.name}”`);
          onCreated?.(project);
        },
        onError: () => toast.error("Couldn't add the project"),
      },
    );
  };

  const chooseLocal = async () => {
    const path = await window.electron?.selectFolder();
    if (path) create(path, null);
  };

  const connect = (host: string) => {
    const mine = ++ticket.current;
    setStep({ kind: "connecting", host });
    window
      .electron!.sshListDir(host, "~")
      .then(({ cwd, dirs }) => {
        if (mine !== ticket.current) return;
        setBrowseError(null);
        setStep({ kind: "browse", host, cwd, dirs });
      })
      .catch((error: unknown) => {
        if (mine !== ticket.current) return;
        setStep({ kind: "failed", host, error });
      });
  };

  const navigate = (path: string) => {
    if (step.kind !== "browse") return;
    const { host } = step;
    const mine = ++ticket.current;
    setBusy(true);
    setNewFolder(null);
    window
      .electron!.sshListDir(host, path)
      .then(({ cwd, dirs }) => {
        if (mine !== ticket.current) return;
        setBrowseError(null);
        setStep({ kind: "browse", host, cwd, dirs });
      })
      .catch((error: unknown) => {
        if (mine !== ticket.current) return;
        setBrowseError(explainSshError(error, host));
      })
      .finally(() => {
        if (mine === ticket.current) setBusy(false);
      });
  };

  const createFolder = (name: string) => {
    if (step.kind !== "browse") return;
    const { host, cwd } = step;
    const mine = ++ticket.current;
    setBusy(true);
    window
      .electron!.ssh.mkdir(host, cwd, name)
      .then((path) => {
        if (mine === ticket.current) navigate(path);
      })
      .catch((error: unknown) => {
        if (mine !== ticket.current) return;
        setBusy(false);
        setBrowseError(explainSshError(error, host));
      });
  };

  const back = () => {
    ticket.current++;
    setBusy(false);
    setBrowseError(null);
    setNewFolder(null);
    setStep({ kind: "start" });
  };

  const openCurrent = () => {
    if (step.kind === "browse" && !busy) create(step.cwd, step.host);
  };

  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent
        className="flex w-full max-w-[34rem] flex-col gap-0 overflow-hidden p-0"
        onEscapeKeyDown={(e) => {
          if (step.kind === "start") return;
          e.preventDefault();
          if (newFolder !== null) setNewFolder(null);
          else back();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            openCurrent();
          }
        }}
      >
        {!isDesktop ? (
          <WebStart
            creating={createProject.isPending}
            onCreate={(path) => create(path, null)}
          />
        ) : step.kind === "start" ? (
          <StartStep
            creating={createProject.isPending}
            onLocal={() => void chooseLocal()}
            onConnect={connect}
          />
        ) : step.kind === "browse" ? (
          <BrowseStep
            host={step.host}
            cwd={step.cwd}
            dirs={step.dirs}
            busy={busy || createProject.isPending}
            error={browseError}
            newFolder={newFolder}
            onNewFolderChange={setNewFolder}
            onCreateFolder={createFolder}
            onNavigate={navigate}
            onBack={back}
            onOpen={openCurrent}
          />
        ) : (
          <ConnectingStep
            host={step.host}
            error={step.kind === "failed" ? step.error : null}
            onBack={back}
            onRetry={() => connect(step.host)}
          />
        )}
      </GlassDialogContent>
    </GlassDialog>
  );
}
