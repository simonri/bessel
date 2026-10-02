import {
  createRecipeV1RecipesPostMutation,
  deleteRecipeV1RecipesRecipeIdDeleteMutation,
  listRecipesV1RecipesGetOptions,
  listRecipesV1RecipesGetQueryKey,
  type RecipeSchema,
  RecipeType,
  updateRecipeV1RecipesRecipeIdPatchMutation,
} from "@bessel/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import {
  EmptyState,
  IconButton,
  PrimaryButton,
  TextInput,
} from "@/components/ui-kit";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";

const RECIPE_TYPE_LABELS: Record<RecipeType, string> = {
  [RecipeType.DESSERT]: "Dessert",
  [RecipeType.MAIN]: "Main",
  [RecipeType.OTHER]: "Other",
};

export const Route = createFileRoute("/_app/recipes")({
  component: Recipes,
});

function ModeToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-full items-center gap-1.5 rounded-md px-2.5 text-12 font-medium transition-colors duration-150 [&_svg]:size-3",
        active
          ? "bg-white/12 text-white/90"
          : "text-white/45 hover:text-white/75",
      )}
    >
      {icon}
      <span className="hidden @lg:inline">{label}</span>
    </button>
  );
}

function Recipes() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [draft, setDraft] = useState<{
    title: string;
    content: string;
    recipe_type: RecipeType;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecipeSchema | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const queryKey = listRecipesV1RecipesGetQueryKey({ client });

  const { data } = useQuery(
    listRecipesV1RecipesGetOptions({
      client,
      query: { limit: 200, sorting: ["title"] },
    }),
  );

  const recipes = data?.items ?? [];
  const filtered = search
    ? recipes.filter((r) =>
        r.title.toLowerCase().includes(search.toLowerCase()),
      )
    : recipes;

  const selected = recipes.find((r) => r.id === selectedId) ?? null;

  // Sync draft when selection changes
  useEffect(() => {
    if (selected) {
      setDraft({
        title: selected.title,
        content: selected.content,
        recipe_type: selected.recipe_type,
      });
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
      updateMutation.mutate({
        client,
        path: { recipe_id: id },
        body: { title, content },
      });
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

  const handleTypeChange = (value: RecipeType) => {
    if (!draft || !selectedId) return;
    setDraft({ ...draft, recipe_type: value });
    updateMutation.mutate({
      client,
      path: { recipe_id: selectedId },
      body: { recipe_type: value },
    });
  };

  const createRecipe = () =>
    createMutation.mutate({ client, body: { title: "Untitled", content: "" } });

  return (
    <div className="@container -m-4 flex min-h-0 flex-1">
      <aside className="flex w-40 shrink-0 flex-col border-r border-white/[0.07] bg-white/[0.015] @2xl:w-56 @lg:w-48">
        <div className="flex shrink-0 items-center gap-1.5 p-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-white/30" />
            <TextInput
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-8 text-12"
            />
          </div>
          <IconButton
            title="New recipe"
            aria-label="New recipe"
            onClick={createRecipe}
          >
            <Plus />
          </IconButton>
        </div>

        <div className="flex items-center justify-between px-3.5 pt-1 pb-1.5">
          <span className="text-11 font-semibold tracking-wide text-white/40">
            Recipes
          </span>
          <span className="text-11 tabular-nums text-white/35">
            {filtered.length}
          </span>
        </div>

        <div className="flex-1 space-y-px overflow-y-auto px-1.5 pb-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-12 text-white/40">
              {search ? "No matches" : "No recipes yet"}
            </p>
          ) : (
            filtered.map((r) => {
              const active = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-13 transition-colors duration-150",
                    active
                      ? "bg-white/[0.08] text-white/90"
                      : "text-white/60 hover:bg-white/[0.05] hover:text-white/85",
                  )}
                  onClick={() => {
                    setSelectedId(r.id);
                    setMode("preview");
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {r.title || "Untitled"}
                  </span>
                  {r.recipe_type !== RecipeType.OTHER && (
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-px text-10 font-medium",
                        active
                          ? "bg-primary-500/15 text-primary-300"
                          : "bg-white/[0.05] text-white/40",
                      )}
                    >
                      {RECIPE_TYPE_LABELS[r.recipe_type]}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!selected || !draft ? (
          <div className="flex h-full items-center justify-center p-4">
            <EmptyState
              icon={<BookOpen />}
              title="No recipe selected"
              className="w-full max-w-xs border-none"
            >
              <p>Pick a recipe from the list or create a new one.</p>
              <PrimaryButton className="mt-3" onClick={createRecipe}>
                <Plus />
                New recipe
              </PrimaryButton>
            </EmptyState>
          </div>
        ) : (
          <>
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
              <input
                type="text"
                value={draft.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="min-w-32 flex-1 bg-transparent text-15 font-semibold text-white/90 outline-none placeholder:text-white/25"
                placeholder="Recipe title"
              />
              <div className="flex shrink-0 items-center gap-1.5">
                <Select
                  value={draft.recipe_type}
                  onValueChange={(v) => handleTypeChange(v as RecipeType)}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-24 rounded-lg border-white/10 bg-white/[0.04] text-12 text-white/75 hover:bg-white/[0.06]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RECIPE_TYPE_LABELS).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <div className="flex h-7 items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                  <ModeToggle
                    active={mode === "edit"}
                    onClick={() => setMode("edit")}
                    icon={<Pencil />}
                    label="Edit"
                  />
                  <ModeToggle
                    active={mode === "preview"}
                    onClick={() => setMode("preview")}
                    icon={<Eye />}
                    label="Preview"
                  />
                </div>
                <IconButton
                  destructive
                  title="Delete recipe"
                  aria-label="Delete recipe"
                  onClick={() => setDeleteTarget(selected)}
                >
                  <Trash2 />
                </IconButton>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {mode === "edit" ? (
                <textarea
                  value={draft.content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="Write your recipe in markdown…"
                  className="block h-full w-full resize-none bg-transparent px-5 py-4 font-mono text-13 leading-relaxed text-white/80 outline-none placeholder:text-white/25"
                />
              ) : (
                <div className="prose prose-invert prose-sm mx-auto max-w-2xl px-5 py-5 text-white/75 prose-headings:font-semibold prose-headings:text-white/90 prose-strong:text-white/90 prose-li:marker:text-white/30 prose-a:text-primary-300 prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-white/[0.06] prose-code:px-1 prose-code:py-px prose-code:font-normal prose-code:text-primary-300 prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-lg prose-pre:border prose-pre:border-white/[0.07] prose-pre:bg-white/[0.03] prose-blockquote:border-l-white/15 prose-blockquote:text-white/55 prose-hr:border-white/[0.07] prose-th:text-white/80 prose-td:border-white/[0.07] prose-tr:border-white/[0.07]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {draft.content || "*Nothing to preview*"}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <ConfirmDeleteDialog
        variant="default"
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete recipe?"
        description={<>"{deleteTarget?.title}" will be permanently deleted.</>}
        onConfirm={() =>
          deleteTarget &&
          deleteMutation.mutate({
            client,
            path: { recipe_id: deleteTarget.id },
          })
        }
      />
    </div>
  );
}
