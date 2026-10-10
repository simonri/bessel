import type { TimeProjectSchema, TimeProjectUpdate } from "@bessel/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  FolderKanban,
} from "lucide-react";
import { useState } from "react";
import {
  IconButton,
  PrimaryButton,
  SoftButton,
  TextInput,
} from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { formatAmount, nextProjectColor, PROJECT_COLORS } from "./time-format";
import type { TimeWrites } from "./use-time-tracking";

export function ProjectsPopover({
  projects,
  writes,
}: {
  projects: TimeProjectSchema[];
  writes: Pick<TimeWrites, "createProject" | "updateProject">;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newName, setNewName] = useState("");
  const active = projects.filter((p) => !p.archived_at);
  const archived = projects.filter((p) => p.archived_at);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const project = await writes
      .createProject({ name, color: nextProjectColor(projects) })
      .catch(() => null);
    if (project) {
      setNewName("");
      setEditingId(project.id);
    }
  };

  const row = (project: TimeProjectSchema) => (
    <ProjectRow
      key={project.id}
      project={project}
      open={editingId === project.id}
      onToggle={() =>
        setEditingId((id) => (id === project.id ? null : project.id))
      }
      onSave={(body) => {
        void writes.updateProject(project, body).catch(() => {});
      }}
    />
  );

  return (
    <Popover onOpenChange={(open) => !open && setEditingId(null)}>
      <PopoverTrigger asChild>
        <SoftButton>
          <FolderKanban />
          Projects
        </SoftButton>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-[min(560px,calc(100vh-6rem))] w-[340px] flex-col overflow-hidden rounded-xl border-white/10 p-0 shadow-2xl"
      >
        <div className="shrink-0 px-4 pt-3 pb-2">
          <p className="text-13 font-medium text-white/90">Projects</p>
          <p className="mt-0.5 text-12 text-white/45">
            What you log time against. Separate from your code projects.
          </p>
        </div>
        <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          {active.length === 0 && (
            <p className="px-2 py-3 text-12 text-white/40">
              No projects yet. Add one below.
            </p>
          )}
          {active.map(row)}
          {archived.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-expanded={showArchived}
                className="mt-1 flex h-7 items-center gap-1 px-2 text-12 text-white/40 hover:text-white/70"
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform duration-150",
                    !showArchived && "-rotate-90",
                  )}
                />
                Archived ({archived.length})
              </button>
              {showArchived && archived.map(row)}
            </>
          )}
        </div>
        <form
          className="flex shrink-0 items-center gap-1.5 border-t border-white/[0.06] px-3 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <TextInput
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New project"
            aria-label="New project name"
            maxLength={200}
          />
          <PrimaryButton size="sm" type="submit" disabled={!newName.trim()}>
            Add
          </PrimaryButton>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function ProjectRow({
  project,
  open,
  onToggle,
  onSave,
}: {
  project: TimeProjectSchema;
  open: boolean;
  onToggle: () => void;
  onSave: (body: TimeProjectUpdate) => void;
}) {
  const archived = project.archived_at !== null;
  return (
    <div className={cn("rounded-lg", open && "bg-white/[0.04]")}>
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={cn(
            "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-13 transition-colors duration-150 hover:bg-white/[0.04]",
            archived ? "text-white/45" : "text-white/85",
          )}
        >
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: project.color }}
          />
          <span className="min-w-0 flex-1 truncate">
            {project.name}
            {project.client && (
              <span className="text-white/40"> - {project.client}</span>
            )}
          </span>
          {project.hourly_rate != null && (
            <span className="shrink-0 text-11 tabular-nums text-white/35">
              {formatAmount(project.hourly_rate, project.currency)}/h
            </span>
          )}
        </button>
        <IconButton
          title={archived ? "Restore" : "Archive"}
          onClick={() => onSave({ archived: !archived })}
          className="mr-1"
        >
          {archived ? <ArchiveRestore /> : <Archive />}
        </IconButton>
      </div>
      {open && <ProjectEditor project={project} onSave={onSave} />}
    </div>
  );
}

function ProjectEditor({
  project,
  onSave,
}: {
  project: TimeProjectSchema;
  onSave: (body: TimeProjectUpdate) => void;
}) {
  const [name, setName] = useState(project.name);
  const [client, setClient] = useState(project.client ?? "");
  const [rate, setRate] = useState(
    project.hourly_rate == null ? "" : String(project.hourly_rate),
  );
  const [currency, setCurrency] = useState(project.currency ?? "");

  const parsedRate = rate.trim() === "" ? null : Number(rate);
  const rateValid =
    parsedRate === null || (Number.isFinite(parsedRate) && parsedRate >= 0);
  const currencyValid = currency === "" || /^[A-Z]{3}$/.test(currency);
  const dirty =
    name.trim() !== project.name ||
    (client.trim() || null) !== project.client ||
    parsedRate !== project.hourly_rate ||
    (currency || null) !== project.currency;
  const valid = name.trim() !== "" && rateValid && currencyValid;

  return (
    <form
      className="flex flex-col gap-2 px-2 pt-1 pb-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || !dirty) return;
        onSave({
          name: name.trim(),
          client: client.trim() || null,
          hourly_rate: parsedRate,
          currency: currency || null,
        });
      }}
    >
      <div className="flex gap-1.5">
        {PROJECT_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            title={color.label}
            aria-label={color.label}
            aria-pressed={project.color === color.hex}
            onClick={() => onSave({ color: color.hex })}
            className={cn(
              "size-5 rounded-full ring-offset-2 ring-offset-popover transition-shadow duration-150",
              project.color === color.hex && "ring-2 ring-white/60",
            )}
            style={{ background: color.hex }}
          />
        ))}
      </div>
      <TextInput
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Project name"
        maxLength={200}
      />
      <TextInput
        value={client}
        onChange={(e) => setClient(e.target.value)}
        placeholder="Client (optional)"
        aria-label="Client"
        maxLength={200}
      />
      <div className="flex gap-1.5">
        <TextInput
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="Hourly rate"
          aria-label="Hourly rate"
          inputMode="decimal"
          className={cn(!rateValid && "border-red-400/50")}
        />
        <TextInput
          value={currency}
          onChange={(e) =>
            setCurrency(e.target.value.toUpperCase().slice(0, 3))
          }
          placeholder="SEK"
          aria-label="Currency"
          className={cn("w-20 shrink-0", !currencyValid && "border-red-400/50")}
        />
      </div>
      <PrimaryButton
        size="sm"
        type="submit"
        disabled={!valid || !dirty}
        className="self-end"
      >
        Save
      </PrimaryButton>
    </form>
  );
}
