import { Button } from "@bessel/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import { cn } from "@bessel/ui/lib/utils";
import {
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Files,
  Link2,
  ListTree,
  Plus,
  Search,
} from "lucide-react";
import { ObsidianIcon } from "@/components/canvas/brand-icons";
import type { VaultInfo } from "./vault-types";

export interface VaultHeaderProps {
  root: string;
  info: VaultInfo | undefined;
  recentVaults: readonly string[];
  onSwitchVault: (root?: string) => void;
  onOpenSwitcher: () => void;
  onOpenSearch: () => void;
  onNewNote: () => void;
  onToday: () => void;
  onToggleBacklinks: () => void;
  onToggleOutline: () => void;
  sidePanel: "backlinks" | "outline" | null;
  onOpenInObsidian: () => void;
}

function IconButton({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-primary/20 text-primary-300"
          : "text-white/40 hover:bg-white/[0.06] hover:text-white/75",
      )}
    >
      {children}
    </button>
  );
}

export function VaultHeader({
  root,
  info,
  recentVaults,
  onSwitchVault,
  onOpenSwitcher,
  onOpenSearch,
  onNewNote,
  onToday,
  onToggleBacklinks,
  onToggleOutline,
  sidePanel,
  onOpenInObsidian,
}: VaultHeaderProps) {
  const others = recentVaults.filter((path) => path !== root);

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-2 py-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-13 font-medium text-white/80 transition-colors hover:bg-white/[0.06]"
          >
            <ObsidianIcon className="size-3.5 shrink-0 text-purple-300/80" />
            <span className="max-w-40 truncate">
              {info?.name ?? "Obsidian"}
            </span>
            <ChevronDown className="size-3 shrink-0 text-white/30" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {others.length > 0 && (
            <>
              <DropdownMenuLabel>Recent vaults</DropdownMenuLabel>
              {others.map((path) => (
                <DropdownMenuItem
                  key={path}
                  onSelect={() => onSwitchVault(path)}
                >
                  {path.split("/").filter(Boolean).pop() ?? path}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => onSwitchVault()}>
            Choose another vault…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void window.electron?.vault.reveal(root, "").catch(() => {})
            }
          >
            Reveal vault folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="min-w-0 flex-1" />

      <IconButton onClick={onOpenSwitcher} title="Quick switcher (Ctrl+O)">
        <Files className="size-3.5" />
      </IconButton>
      <IconButton onClick={onOpenSearch} title="Search (Ctrl+Shift+F)">
        <Search className="size-3.5" />
      </IconButton>
      {info?.dailyNotes && (
        <IconButton onClick={onToday} title="Today's daily note">
          <CalendarDays className="size-3.5" />
        </IconButton>
      )}
      <IconButton onClick={onNewNote} title="New note (Ctrl+N)">
        <Plus className="size-3.5" />
      </IconButton>
      <IconButton
        onClick={onToggleBacklinks}
        title="Backlinks"
        active={sidePanel === "backlinks"}
      >
        <Link2 className="size-3.5" />
      </IconButton>
      <IconButton
        onClick={onToggleOutline}
        title="Outline"
        active={sidePanel === "outline"}
      >
        <ListTree className="size-3.5" />
      </IconButton>
      <Button variant="outline" size="xs" onClick={onOpenInObsidian}>
        <ExternalLink className="size-3" />
        Open in Obsidian
      </Button>
    </div>
  );
}
