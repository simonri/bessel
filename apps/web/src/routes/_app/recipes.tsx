import {
  createRecipeV1RecipesPostMutation,
  deleteRecipeV1RecipesRecipeIdDeleteMutation,
  listRecipesV1RecipesGetOptions,
  listRecipesV1RecipesGetQueryKey,
  type RecipeBody,
  type RecipeImportResult,
  type RecipeSchema,
  type RecipeType,
  structureRecipeTextV1RecipesImportPostMutation,
  updateRecipeV1RecipesRecipeIdPatchMutation,
} from "@bessel/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ChefHat,
  FilePen,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import {
  cleanRecipeBody,
  emptyRecipeBody,
  RecipeEditor,
} from "@/components/recipes/recipe-editor";
import { RecipeGallery } from "@/components/recipes/recipe-gallery";
import {
  IMPORT_FALLBACK_ERROR,
  RecipeImportDialog,
} from "@/components/recipes/recipe-import-dialog";
import { matchesRecipe } from "@/components/recipes/recipe-meta";
import { RecipeReader } from "@/components/recipes/recipe-reader";
import {
  RECIPE_TYPE_META,
  RECIPE_TYPES,
  typeTint,
} from "@/components/recipes/recipe-style";
import { RecipeTidyBanner } from "@/components/recipes/recipe-tidy-banner";
import { IconButton } from "@/components/ui-kit";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/recipes")({
  component: Recipes,
});

function Segment({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-full items-center gap-1.5 rounded-full px-2.5 text-12 font-medium transition-[background-color,color] duration-150 [&_svg]:size-3",
        active
          ? "bg-white/[0.12] text-white/90"
          : "text-white/45 hover:text-white/75",
      )}
    >
      {icon}
      <span className="hidden @lg:inline">{label}</span>
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  style,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      style={active ? style : undefined}
      className={cn(
        "flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-11 font-medium transition-colors duration-150",
        active
          ? !style && "bg-white/10 text-white/85"
          : "text-white/45 hover:bg-white/[0.05] hover:text-white/75",
      )}
    >
      {children}
    </button>
  );
}

type RecipeDraft = {
  title: string;
  body: RecipeBody;
  recipe_type: RecipeType;
};

function draftFrom(recipe: RecipeSchema): RecipeDraft {
  const { body } = recipe;
  const blank = !body.ingredient_groups?.length && !body.steps?.length;
  return {
    title: recipe.title,
    body: blank ? { ...body, ...emptyRecipeBody() } : body,
    recipe_type: recipe.recipe_type,
  };
}

function NewRecipeMenu({
  onBlank,
  onPaste,
}: {
  onBlank: () => void;
  onPaste: () => void;
}) {
  const item =
    "flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors data-[highlighted]:bg-white/[0.06]";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="New recipe"
          aria-label="New recipe"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition-[background-color,transform] duration-150 hover:bg-primary-400 active:scale-95 data-[state=open]:bg-primary-400"
        >
          <Plus className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-64 rounded-xl border-white/10 bg-popover p-1 shadow-2xl"
      >
        <DropdownMenuItem className={item} onSelect={onPaste}>
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary-300" />
          <span className="flex flex-col gap-0.5">
            <span className="text-13 text-white/85">Paste a recipe</span>
            <span className="text-11 text-white/40">
              From anywhere - it gets sorted for you
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={onBlank}>
          <FilePen className="mt-0.5 size-3.5 shrink-0 text-white/50" />
          <span className="flex flex-col gap-0.5">
            <span className="text-13 text-white/85">Write from scratch</span>
            <span className="text-11 text-white/40">
              Start with a blank card
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Recipes() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<RecipeType | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecipeSchema | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [tidyingId, setTidyingId] = useState<string | null>(null);
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
  const query = search.trim();
  const filtered = recipes.filter(
    (r) =>
      (!typeFilter || r.recipe_type === typeFilter) &&
      (!query || matchesRecipe(r, query)),
  );

  const selected = recipes.find((r) => r.id === selectedId) ?? null;

  // Load the draft when a recipe opens — not on every save: the server
  // returns the cleaned body, which would wipe rows still being filled in.
  const selectedKey = selected?.id ?? null;
  const selectedIdRef = useRef(selectedKey);
  selectedIdRef.current = selectedKey;
  useEffect(() => {
    setDraft(selected ? draftFrom(selected) : null);
  }, [selectedKey]);

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

  // Hook-level callbacks, unlike per-call ones, still run after the page
  // unmounts, so a tidy finishing while you're elsewhere is still saved.
  const restoreMutation = useMutation({
    ...updateRecipeV1RecipesRecipeIdPatchMutation({ client }),
    onSuccess: (restored) => {
      void queryClient.invalidateQueries({ queryKey });
      if (selectedIdRef.current === restored.id) setDraft(draftFrom(restored));
    },
    onError: () => toast.error("Couldn't undo"),
  });

  const tidyTarget = useRef<RecipeSchema | null>(null);
  const tidyMutation = useMutation({
    ...structureRecipeTextV1RecipesImportPostMutation({ client }),
    onSuccess: (result) => {
      const recipe = tidyTarget.current;
      if (!recipe) return;
      const title = recipe.title || result.title;
      if (selectedIdRef.current === recipe.id) {
        setDraft((d) => d && { ...d, title, body: result.body });
      }
      updateMutation.mutate({
        client,
        path: { recipe_id: recipe.id },
        body: { title, body: result.body },
      });
      toast.success("All tidied up", {
        description: "Ingredients, steps and timers are sorted.",
        action: {
          label: "Undo",
          onClick: () =>
            restoreMutation.mutate({
              client,
              path: { recipe_id: recipe.id },
              body: { title: recipe.title, content: recipe.content },
            }),
        },
      });
    },
    onError: (error) =>
      toast.error("Couldn't tidy this one", {
        description: errorDetail(error, IMPORT_FALLBACK_ERROR),
      }),
    onSettled: () => {
      tidyTarget.current = null;
      setTidyingId(null);
    },
  });

  // Debounced auto-save
  const scheduleSave = (id: string, title: string, body: RecipeBody) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateMutation.mutate({
        client,
        path: { recipe_id: id },
        body: { title, body: cleanRecipeBody(body) },
      });
    }, 1000);
  };

  const handleTitleChange = (value: string) => {
    if (!draft || !selectedId) return;
    const next = { ...draft, title: value };
    setDraft(next);
    scheduleSave(selectedId, next.title, next.body);
  };

  const handleBodyChange = (value: RecipeBody) => {
    if (!draft || !selectedId) return;
    const next = { ...draft, body: value };
    setDraft(next);
    scheduleSave(selectedId, next.title, next.body);
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
    createMutation.mutate({
      client,
      body: {
        title: "",
        body: cleanRecipeBody(emptyRecipeBody()),
        ...(typeFilter ? { recipe_type: typeFilter } : {}),
      },
    });

  const createFromImport = (result: RecipeImportResult) =>
    createMutation.mutate(
      {
        client,
        body: {
          title: result.title,
          recipe_type: result.recipe_type,
          body: result.body,
        },
      },
      {
        onSuccess: () => {
          setMode("preview");
          toast.success("Recipe added", {
            description: "Give it a quick look - tweak anything in Edit.",
          });
        },
      },
    );

  // Structures a recipe that is still plain markdown. The old text stays one
  // tap away: restoring `content` alone puts the recipe back exactly as it was.
  const tidyRecipe = (recipe: RecipeSchema) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    tidyTarget.current = recipe;
    setTidyingId(recipe.id);
    tidyMutation.mutate({
      client,
      body: {
        text: recipe.title
          ? `# ${recipe.title}\n\n${recipe.content}`
          : recipe.content,
      },
    });
  };

  const openRecipe = (recipe: RecipeSchema) => {
    setSelectedId(recipe.id);
    setMode("preview");
  };

  return (
    <div className="@container -m-4 flex min-h-0 flex-1">
      <aside className="flex w-44 shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.015] @2xl:w-64 @lg:w-52">
        <div className="flex shrink-0 items-center gap-1.5 p-2.5 pb-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-white/30" />
            <input
              type="search"
              placeholder="Search recipes…"
              aria-label="Search recipes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-full bg-white/[0.05] pr-3 pl-8 text-12 text-white/85 ring-1 ring-white/[0.06] outline-none transition-[box-shadow,background-color] placeholder:text-white/30 focus:bg-white/[0.07] focus:ring-primary-400/40"
            />
          </div>
          <NewRecipeMenu
            onBlank={createRecipe}
            onPaste={() => setImportOpen(true)}
          />
        </div>

        <div className="flex shrink-0 items-center gap-0.5 px-2.5 pb-2">
          <FilterChip
            active={typeFilter === null}
            onClick={() => setTypeFilter(null)}
          >
            All
          </FilterChip>
          {RECIPE_TYPES.map((type) => (
            <FilterChip
              key={type}
              active={typeFilter === type}
              onClick={() => setTypeFilter(typeFilter === type ? null : type)}
              style={typeTint(type)}
              title={RECIPE_TYPE_META[type].plural}
            >
              <span aria-hidden>{RECIPE_TYPE_META[type].emoji}</span>
              <span className="hidden @2xl:inline">
                {RECIPE_TYPE_META[type].plural}
              </span>
            </FilterChip>
          ))}
        </div>

        <div className="flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-12 text-white/40">
              {recipes.length === 0 ? "No recipes yet" : "No matches"}
            </p>
          ) : (
            filtered.map((r) => {
              const active = r.id === selectedId;
              const meta = RECIPE_TYPE_META[r.recipe_type];
              return (
                <button
                  key={r.id}
                  type="button"
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-13 transition-colors duration-150",
                    active
                      ? "bg-white/[0.08] text-white/90"
                      : "text-white/65 hover:bg-white/[0.05] hover:text-white/85",
                  )}
                  onClick={() => openRecipe(r)}
                >
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-lg text-13"
                    style={typeTint(r.recipe_type, active ? 0.22 : 0.12)}
                  >
                    {meta.emoji}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.title || "Untitled"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!selected || !draft ? (
          <RecipeGallery
            recipes={filtered}
            totalCount={recipes.length}
            filtered={filtered.length !== recipes.length}
            onOpen={openRecipe}
            onCreate={createRecipe}
            onImport={() => setImportOpen(true)}
          />
        ) : (
          <>
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2">
              <IconButton
                title="All recipes"
                aria-label="All recipes"
                onClick={() => setSelectedId(null)}
              >
                <LayoutGrid />
              </IconButton>
              {mode === "edit" ? (
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="min-w-32 flex-1 bg-transparent text-15 font-semibold text-white/90 outline-none placeholder:text-white/25"
                  placeholder="What's it called?"
                  // biome-ignore lint/a11y/noAutofocus: a brand-new recipe starts by naming it
                  autoFocus={!draft.title}
                />
              ) : (
                <div className="min-w-0 flex-1" />
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                {mode === "edit" && (
                  <div className="flex h-7 items-center gap-0.5 rounded-full bg-white/[0.04] p-0.5 ring-1 ring-white/[0.06]">
                    {RECIPE_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={draft.recipe_type === type}
                        title={RECIPE_TYPE_META[type].label}
                        onClick={() => handleTypeChange(type)}
                        style={
                          draft.recipe_type === type
                            ? typeTint(type, 0.2)
                            : undefined
                        }
                        className={cn(
                          "flex h-full items-center gap-1 rounded-full px-2 text-12 font-medium transition-colors duration-150",
                          draft.recipe_type !== type &&
                            "text-white/45 hover:text-white/75",
                        )}
                      >
                        <span aria-hidden>{RECIPE_TYPE_META[type].emoji}</span>
                        <span className="hidden @2xl:inline">
                          {RECIPE_TYPE_META[type].label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex h-7 items-center rounded-full bg-white/[0.04] p-0.5 ring-1 ring-white/[0.06]">
                  <Segment
                    active={mode === "preview"}
                    onClick={() => setMode("preview")}
                    icon={<ChefHat />}
                    label="Cook"
                  />
                  <Segment
                    active={mode === "edit"}
                    onClick={() => setMode("edit")}
                    icon={<Pencil />}
                    label="Edit"
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
              {!selected.structured && (
                <RecipeTidyBanner
                  pending={tidyingId === selected.id}
                  disabled={tidyingId !== null}
                  onTidy={() => tidyRecipe(selected)}
                />
              )}
              <div
                inert={tidyingId === selected.id}
                className={cn(
                  "transition-opacity duration-300",
                  tidyingId === selected.id && "opacity-40",
                )}
              >
                {mode === "edit" ? (
                  <RecipeEditor
                    value={draft.body}
                    onChange={handleBodyChange}
                  />
                ) : (
                  <RecipeReader
                    key={selected.id}
                    title={draft.title}
                    type={draft.recipe_type}
                    body={draft.body}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <RecipeImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={createFromImport}
      />

      <ConfirmDeleteDialog
        variant="default"
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this recipe?"
        description={
          <>"{deleteTarget?.title || "Untitled"}" will be gone for good.</>
        }
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
