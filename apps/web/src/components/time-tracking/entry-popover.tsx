import type { TimeProjectSchema } from "@bessel/client";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@bessel/ui/components/popover";
import { format, isSameDay } from "date-fns";
import { Check, Plus, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import {
  IconButton,
  PrimaryButton,
  SoftButton,
  TextInput,
} from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import {
  PLACEMENT_GAP,
  useFixedPlacement,
  VIEWPORT_PADDING,
} from "../calendar/popover-placement";
import { formatHours } from "./time-format";

export interface EntrySubject {
  /** Null while creating. */
  entryId: string | null;
  /** Wall-clock times, as the grid shows them. */
  start: Date;
  end: Date;
  projectId: string | null;
  note: string;
}

function timeRange(start: Date, end: Date): string {
  const day = format(start, "EEE d MMM");
  const until = isSameDay(start, end)
    ? format(end, "HH:mm")
    : format(end, "EEE HH:mm");
  return `${day}, ${format(start, "HH:mm")}-${until}`;
}

export function EntryPopover({
  subject,
  anchor,
  projects,
  onSave,
  onDelete,
  onClose,
  onCreateProject,
}: {
  subject: EntrySubject | null;
  anchor: HTMLElement | null;
  /** Projects that can be picked: the active ones. */
  projects: TimeProjectSchema[];
  onSave: (projectId: string, note: string) => void;
  onDelete: () => void;
  onClose: () => void;
  onCreateProject: (name: string) => Promise<TimeProjectSchema>;
}) {
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const placement = useFixedPlacement(anchor, content);

  return (
    <Popover
      open={subject !== null && anchor !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {anchor && <PopoverAnchor virtualRef={{ current: anchor }} />}
      {subject && (
        <PopoverContent
          side={placement?.side ?? "right"}
          align="start"
          sideOffset={PLACEMENT_GAP}
          alignOffset={placement?.alignOffset ?? 0}
          avoidCollisions={false}
          className={cn(
            "w-[300px] overflow-hidden rounded-xl border-white/10 p-0 shadow-2xl",
            !placement && "invisible",
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (anchor?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          <div
            ref={setContent}
            style={{
              maxHeight: `calc(100vh - ${2 * VIEWPORT_PADDING}px)`,
            }}
            className="flex flex-col"
          >
            <EntryForm
              key={subject.entryId ?? subject.start.toISOString()}
              subject={subject}
              projects={projects}
              onSave={onSave}
              onDelete={onDelete}
              onClose={onClose}
              onCreateProject={onCreateProject}
            />
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

function EntryForm({
  subject,
  projects,
  onSave,
  onDelete,
  onClose,
  onCreateProject,
}: {
  subject: EntrySubject;
  projects: TimeProjectSchema[];
  onSave: (projectId: string, note: string) => void;
  onDelete: () => void;
  onClose: () => void;
  onCreateProject: (name: string) => Promise<TimeProjectSchema>;
}) {
  const [projectId, setProjectId] = useState(subject.projectId);
  const [note, setNote] = useState(subject.note);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const noteId = useId();
  const seconds = (subject.end.getTime() - subject.start.getTime()) / 1000;
  const canSave = projectId !== null;

  const save = () => {
    if (projectId) onSave(projectId, note.trim());
  };

  const addProject = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const project = await onCreateProject(name);
      setProjectId(project.id);
      setNewName("");
    } catch {
      // Reported by the write.
    } finally {
      setAdding(false);
    }
  };

  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        const typing = (e.target as HTMLElement).tagName === "INPUT";
        const index = Number(e.key) - 1;
        if (!typing && index >= 0 && index < Math.min(projects.length, 9)) {
          e.preventDefault();
          setProjectId(projects[index].id);
        }
      }}
    >
      <div className="flex shrink-0 items-start gap-2 pt-3 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <p className="text-13 font-medium text-white/90">
            {subject.entryId ? "Time entry" : "Log time"}
          </p>
          <p className="mt-0.5 text-12 tabular-nums text-white/50">
            {timeRange(subject.start, subject.end)} - {formatHours(seconds)}
          </p>
        </div>
        <IconButton title="Close" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-3">
        <fieldset className="flex flex-col gap-0.5">
          <legend className="mb-1 text-12 text-white/45">Project</legend>
          {projects.map((project, i) => {
            const picked = project.id === projectId;
            return (
              <button
                key={project.id}
                type="button"
                aria-pressed={picked}
                onClick={() => setProjectId(project.id)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-left text-13 transition-colors duration-150",
                  picked
                    ? "bg-white/[0.08] text-white/90"
                    : "text-white/70 hover:bg-white/[0.04]",
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
                {picked ? (
                  <Check className="size-3.5 text-white/70" />
                ) : (
                  i < 9 && (
                    <span className="text-11 tabular-nums text-white/25">
                      {i + 1}
                    </span>
                  )
                )}
              </button>
            );
          })}
          <div className="mt-1 flex items-center gap-1.5">
            <TextInput
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addProject();
                }
              }}
              placeholder={
                projects.length === 0
                  ? "Name your first project"
                  : "New project"
              }
              aria-label="New project name"
              className="h-8"
              autoFocus={projects.length === 0}
            />
            <IconButton
              title="Add project"
              disabled={!newName.trim() || adding}
              onClick={() => void addProject()}
            >
              <Plus />
            </IconButton>
          </div>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor={noteId} className="text-12 text-white/45">
            Note
          </label>
          <TextInput
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What you worked on (optional)"
            maxLength={2000}
            autoFocus={projects.length > 0}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.06] px-4 py-2.5">
        {subject.entryId && (
          <IconButton title="Delete entry" destructive onClick={onDelete}>
            <Trash2 />
          </IconButton>
        )}
        <span className="flex-1" />
        <SoftButton onClick={onClose}>Cancel</SoftButton>
        <PrimaryButton size="sm" type="submit" disabled={!canSave}>
          {subject.entryId ? "Save" : "Log time"}
        </PrimaryButton>
      </div>
    </form>
  );
}
