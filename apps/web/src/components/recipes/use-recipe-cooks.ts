import {
  listRecipeCooksQueryKey,
  listRecipesQueryKey,
  logRecipeCookedMutation,
  type RecipeListResponse,
  type RecipeSchema,
  removeRecipeCookedMutation,
} from "@bessel/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { client } from "@/lib/client";
import { apiDate } from "@/lib/local-day";

function dayLabel(day: string, today: string): string {
  if (day === today) return "today";
  return format(new Date(`${day}T12:00:00`), "EEE d MMM");
}

/** Logging and unlogging the days a recipe was cooked, keeping the cached
 *  recipe list and the recipe's history in step with what the server says. */
export function useRecipeCooks(today: string) {
  const queryClient = useQueryClient();

  const replaceRecipe = (recipe: RecipeSchema) => {
    queryClient.setQueriesData<RecipeListResponse>(
      { queryKey: listRecipesQueryKey({ client }) },
      (old) =>
        old && {
          ...old,
          items: old.items.map((r) => (r.id === recipe.id ? recipe : r)),
        },
    );
    void queryClient.invalidateQueries({
      queryKey: listRecipeCooksQueryKey({
        client,
        path: { recipe_id: recipe.id },
      }),
    });
  };

  const remove = useMutation({
    ...removeRecipeCookedMutation({ client }),
    onSuccess: replaceRecipe,
    onError: () => toast.error("Couldn't remove that day"),
  });

  const log = useMutation({
    ...logRecipeCookedMutation({ client }),
    onSuccess: ({ recipe, created }, { path }) => {
      replaceRecipe(recipe);
      const day = dayLabel(path.cooked_on.toISOString().slice(0, 10), today);
      if (!created) {
        toast(`Already logged for ${day}`);
        return;
      }
      // Only a day this request added is offered back: undoing one logged
      // elsewhere (the phone, a moment earlier) would take that away too.
      toast.success(`Logged as cooked ${day === "today" ? day : `on ${day}`}`, {
        action: {
          label: "Undo",
          onClick: () => remove.mutate({ client, path }),
        },
      });
    },
    onError: () => toast.error("Couldn't log that"),
  });

  return {
    logCooked: (recipe: Pick<RecipeSchema, "id">, day: string) =>
      log.mutate({
        client,
        path: { recipe_id: recipe.id, cooked_on: apiDate(day) },
      }),
    removeCooked: (recipe: Pick<RecipeSchema, "id">, day: string) =>
      remove.mutate({
        client,
        path: { recipe_id: recipe.id, cooked_on: apiDate(day) },
      }),
    pending: log.isPending || remove.isPending,
  };
}
