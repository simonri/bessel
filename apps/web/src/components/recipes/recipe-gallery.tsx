import type { RecipeSchema } from "@bessel/client";
import { Plus, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeRecipe } from "./recipe-meta";
import { RECIPE_TYPE_META, typeGradient } from "./recipe-style";

function RecipeCard({
  recipe,
  onOpen,
}: {
  recipe: RecipeSchema;
  onOpen: () => void;
}) {
  const meta = RECIPE_TYPE_META[recipe.recipe_type];
  const summary = describeRecipe(recipe.content);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white/[0.04] text-left ring-1 ring-white/[0.06] transition-[transform,background-color,box-shadow] duration-200 ease-out hover:bg-white/[0.06] hover:ring-white/[0.12] motion-safe:hover:-translate-y-0.5 focus-visible:ring-primary-400/50"
    >
      <div
        className="flex h-20 items-center justify-center text-3xl"
        style={typeGradient(recipe.recipe_type)}
      >
        <span
          aria-hidden
          className="transition-transform duration-300 ease-out motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-6"
        >
          {meta.emoji}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <span className="truncate text-13 font-medium text-white/90">
          {recipe.title || "Untitled"}
        </span>
        <span className="truncate text-11 text-white/45">
          {summary ?? meta.label}
        </span>
      </div>
    </button>
  );
}

/** The page's home when nothing is open: browse, or let fate decide. */
export function RecipeGallery({
  recipes,
  totalCount,
  filtered,
  onOpen,
  onCreate,
}: {
  recipes: RecipeSchema[];
  totalCount: number;
  filtered: boolean;
  onOpen: (recipe: RecipeSchema) => void;
  onCreate: () => void;
}) {
  if (totalCount === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span aria-hidden className="text-4xl">
          🍳
        </span>
        <div>
          <p className="text-sm font-medium text-white/85">
            Your cookbook is empty
          </p>
          <p className="mt-1 text-xs text-white/45">
            Save the recipes you love so they're always one click away.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="mt-1 flex h-8 items-center gap-1.5 rounded-full bg-primary-500 px-4 text-xs font-medium text-white transition-colors hover:bg-primary-400"
        >
          <Plus className="size-3.5" />
          Add your first recipe
        </button>
      </div>
    );
  }

  const surprise = () =>
    recipes.length > 0 &&
    onOpen(recipes[Math.floor(Math.random() * recipes.length)]);

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-white/90">
              What are we cooking?
            </h2>
            <p className="text-xs text-white/45">
              {filtered
                ? `${recipes.length} of ${totalCount} recipes`
                : `${totalCount} recipe${totalCount === 1 ? "" : "s"} in your cookbook`}
            </p>
          </div>
          <button
            type="button"
            onClick={surprise}
            disabled={recipes.length === 0}
            className="flex h-8 items-center gap-1.5 rounded-full bg-primary-500/15 px-3.5 text-xs font-medium text-primary-300 ring-1 ring-primary-400/20 transition-colors hover:bg-primary-500/25 disabled:opacity-40"
          >
            <Shuffle className="size-3.5" />
            Surprise me
          </button>
        </div>
        {recipes.length === 0 ? (
          <p className="py-10 text-center text-xs text-white/45">
            Nothing matches - try another search.
          </p>
        ) : (
          <div
            className={cn(
              "grid gap-3",
              "grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]",
            )}
          >
            {recipes.map((r) => (
              <RecipeCard key={r.id} recipe={r} onOpen={() => onOpen(r)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
