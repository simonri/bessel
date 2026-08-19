import { Button } from "@bessel/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@bessel/ui/components/empty";
import { FolderOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ObsidianIcon } from "@/components/canvas/brand-icons";
import type { VaultDefaultPath, VaultInfo } from "./vault-types";

export interface VaultPickerProps {
  recentVaults: readonly string[];
  onOpen: (root: string) => void;
  onRemoveRecent: (root: string) => void;
}

function basenameOfPath(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function useLazyInspect(path: string | null): VaultInfo | null {
  const [info, setInfo] = useState<VaultInfo | null>(null);
  useEffect(() => {
    setInfo(null);
    if (!path) return;
    let cancelled = false;
    window.electron?.vault
      .inspect(path)
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);
  return info;
}

function VaultCard({
  path,
  autoFocus,
  badge,
  disabled,
  onOpen,
  onRemove,
}: {
  path: string;
  autoFocus?: boolean;
  badge?: string;
  disabled?: boolean;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const info = useLazyInspect(disabled ? null : path);

  return (
    <div className="group relative w-full">
      <button
        type="button"
        // biome-ignore lint/a11y/noAutofocus: the default/only reachable vault should be keyboard-ready on open
        autoFocus={autoFocus}
        disabled={disabled}
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.06] focus:border-primary-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ObsidianIcon className="size-5 shrink-0 text-purple-300/80" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-white/85">
              {basenameOfPath(path)}
            </span>
            {badge && (
              <span className="shrink-0 rounded-full bg-primary-500/15 px-1.5 py-0.5 text-10 font-medium text-primary-300">
                {badge}
              </span>
            )}
          </div>
          <p className="truncate text-11 text-white/40">
            {disabled
              ? "Folder not found"
              : info
                ? `${path} · ${info.noteCount} note${info.noteCount === 1 ? "" : "s"}`
                : path}
          </p>
        </div>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove from recents"
          className="absolute top-2 right-2 rounded p-1 text-white/20 opacity-0 transition-opacity hover:text-white/70 group-hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

export function VaultPicker({
  recentVaults,
  onOpen,
  onRemoveRecent,
}: VaultPickerProps) {
  const [defaultPath, setDefaultPath] = useState<VaultDefaultPath | null>(null);

  useEffect(() => {
    window.electron?.vault
      .defaultPath()
      .then(setDefaultPath)
      .catch(() => {});
  }, []);

  const recents = recentVaults.filter((p) => p !== defaultPath?.path);

  const chooseFolder = async () => {
    const selected = await window.electron?.selectFolder();
    if (selected) onOpen(selected);
  };

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <Empty className="max-w-md flex-none border-0 p-0">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="bg-purple-500/10 text-purple-300"
          >
            <ObsidianIcon className="size-6" />
          </EmptyMedia>
          <EmptyTitle>Open an Obsidian vault</EmptyTitle>
          <EmptyDescription>
            Pick the folder for your vault to browse and edit its notes.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-full gap-2">
          {defaultPath && (
            <VaultCard
              path={defaultPath.path}
              autoFocus
              disabled={!defaultPath.exists}
              badge={defaultPath.isVault ? "Obsidian vault" : undefined}
              onOpen={() => onOpen(defaultPath.path)}
            />
          )}
          {recents.map((path) => (
            <VaultCard
              key={path}
              path={path}
              onOpen={() => onOpen(path)}
              onRemove={() => onRemoveRecent(path)}
            />
          ))}
          <Button
            variant="outline"
            className="mt-1 w-full"
            onClick={chooseFolder}
          >
            <FolderOpen className="size-4" />
            Choose folder…
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
