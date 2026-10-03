import { projectDotColor } from "@/components/tasks/project-colors";
import { cn } from "@/lib/utils";

export function ProjectFilterButton({
  active,
  onClick,
  project,
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** Shows the project's colour; absent for "All". */
  project?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-11 font-medium transition-colors duration-150",
        active
          ? "bg-white/10 text-white/85"
          : "text-white/45 hover:bg-white/[0.05] hover:text-white/75",
      )}
    >
      {project && (
        <span
          aria-hidden
          className="size-1.5 rounded-full"
          style={{ backgroundColor: projectDotColor(project) }}
        />
      )}
      {children}
    </button>
  );
}
