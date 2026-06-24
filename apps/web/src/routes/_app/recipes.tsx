import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { RecipeSchema } from "@metron/client";
import {
  createRecipeV1RecipesPostMutation,
  deleteRecipeV1RecipesRecipeIdDeleteMutation,
  listRecipesV1RecipesGetOptions,
  listRecipesV1RecipesGetQueryKey,
  updateRecipeV1RecipesRecipeIdPatchMutation,
} from "@metron/client";
import { Button } from "@metron/ui/components/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metron/ui/components/alert-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@metron/ui/components/empty";
import { toast } from "sonner";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/recipes")({
  component: Recipes,
});

function Recipes() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [draft, setDraft] = useState<{ title: string; content: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecipeSchema | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const queryKey = listRecipesV1RecipesGetQueryKey({ client });

  const { data } = useQuery(
    listRecipesV1RecipesGetOptions({ client, query: { limit: 200, sorting: ["title"] } }),
  );

  const recipes = data?.items ?? [];
  const filtered = search
    ? recipes.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()))
    : recipes;

  const selected = recipes.find((r) => r.id === selectedId) ?? null;

  // Sync draft when selection changes
  useEffect(() => {
    if (selected) {
      setDraft({ title: selected.title, content: selected.content });
    } else {
      setDraft(null);
    }
  }, [selectedId, selected?.modified_at]);

  const createMutation = useMutation({
    ...createRecipeV1RecipesPostMutation({ client }),
    onSuccess: (recipe) => {
      void queryClient.invalidateQueries({ queryKey });
      setSelectedId(recipe.id);
      setMode("edit");
    },
    onError: () => toast.error("Failed to create recipe"),
  });

  const updateMutation = useMutation({
    ...updateRecipeV1RecipesRecipeIdPatchMutation({ client }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: () => toast.error("Failed to save recipe"),
  });

  const deleteMutation = useMutation({
    ...deleteRecipeV1RecipesRecipeIdDeleteMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      setSelectedId(null);
      setDeleteTarget(null);
    },
    onError: () => toast.error("Failed to delete recipe"),
  });

  // Debounced auto-save
  const scheduleSave = (id: string, title: string, content: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateMutation.mutate({ client, path: { recipe_id: id }, body: { title, content } });
    }, 1000);
  };

  const handleTitleChange = (value: string) => {
    if (!draft || !selectedId) return;
    const next = { ...draft, title: value };
    setDraft(next);
    scheduleSave(selectedId, next.title, next.content);
  };

  const handleContentChange = (value: string) => {
    if (!draft || !selectedId) return;
    const next = { ...draft, content: value };
    setDraft(next);
    scheduleSave(selectedId, next.title, next.content);
  };

  return (
    <div className="flex h-full gap-0 -m-4">
      {/* Left: recipe list */}
      <div className="flex w-52 shrink-0 flex-col border-r border-white/10">
        {/* Search + new */}
        <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-2">
          <Search className="size-3.5 shrink-0 text-white/30" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-xs text-white/80 placeholder:text-white/25 outline-none"
          />
          <button
            type="button"
            title="New recipe"
            className="shrink-0 text-white/35 hover:text-white/80 transition-colors"
            onClick={() => createMutation.mutate({ client, body: { title: "Untitled", content: "" } })}
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-[11px] text-white/25">
              {search ? "No matches" : "No recipes yet"}
            </p>
          ) : (
            filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`w-full truncate px-3 py-2 text-left text-[13px] transition-colors ${
                  r.id === selectedId
                    ? "bg-white/10 text-white/90"
                    : "text-white/55 hover:bg-white/5 hover:text-white/80"
                }`}
                onClick={() => { setSelectedId(r.id); setMode("preview"); }}
              >
                {r.title || "Untitled"}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: editor / preview */}
      <div className="flex flex-1 flex-col min-w-0">
        {!selected || !draft ? (
          <div className="flex h-full items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <BookOpen />
                </EmptyMedia>
                <EmptyTitle>No recipe selected</EmptyTitle>
                <EmptyDescription>Pick a recipe from the list or create a new one.</EmptyDescription>
              </EmptyHeader>
              <Button
                size="sm"
                onClick={() => createMutation.mutate({ client, body: { title: "Untitled", content: "" } })}
              >
                <Plus className="size-3.5 mr-1.5" />
                New recipe
              </Button>
            </Empty>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
              <input
                type="text"
                value={draft.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-white/90 placeholder:text-white/30 outline-none"
                placeholder="Recipe title"
              />
              <div className="flex items-center rounded-md border border-white/10 p-0.5 shrink-0">
                <button
                  type="button"
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${
                    mode === "edit" ? "bg-white/10 text-white/80" : "text-white/35 hover:text-white/60"
                  }`}
                  onClick={() => setMode("edit")}
                >
                  <Pencil className="size-3" />
                  Edit
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${
                    mode === "preview" ? "bg-white/10 text-white/80" : "text-white/35 hover:text-white/60"
                  }`}
                  onClick={() => setMode("preview")}
                >
                  <Eye className="size-3" />
                  Preview
                </button>
              </div>
              <button
                type="button"
                className="shrink-0 text-white/25 hover:text-red-400 transition-colors"
                onClick={() => setDeleteTarget(selected)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto">
              {mode === "edit" ? (
                <textarea
                  value={draft.content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="Write your recipe in markdown…"
                  className="h-full w-full resize-none bg-transparent p-4 text-sm text-white/80 placeholder:text-white/25 outline-none font-mono leading-relaxed"
                />
              ) : (
                <div className="prose prose-invert prose-sm max-w-none p-4 prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-code:text-emerald-400 prose-code:before:content-none prose-code:after:content-none prose-a:text-blue-400 prose-blockquote:border-l-white/20 prose-hr:border-white/10">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {draft.content || "*Nothing to preview*"}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recipe?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTarget && deleteMutation.mutate({ client, path: { recipe_id: deleteTarget.id } })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
