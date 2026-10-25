import type { NameSuggestion, TransactionSchema } from "@bessel/client";
import {
  listTransactionsQueryKey,
  nameTransactionsMutation,
  renameTransactionMutation,
  updateTransactionMutation,
} from "@bessel/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { SoftButton, TextInput } from "@/components/ui-kit";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";

/** What the user calls it, or else the bank's own text. */
export function displayName(transaction: TransactionSchema): string {
  return transaction.name ?? transaction.description ?? "No description";
}

/** Names and notes change the list's rows and the month's biggest spending. */
function useRefresh() {
  const queryClient = useQueryClient();
  return (changed?: Partial<TransactionSchema> & { id: string }) => {
    const queryKey = listTransactionsQueryKey({ client });
    if (changed) {
      queryClient.setQueriesData({ queryKey }, (old: any) =>
        old?.items
          ? {
              ...old,
              items: old.items.map((t: TransactionSchema) =>
                t.id === changed.id ? { ...t, ...changed } : t,
              ),
            }
          : old,
      );
    }
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({
      predicate: (query) =>
        (query.queryKey[0] as { _id?: string } | undefined)?._id ===
        "getTransactionSummary",
    });
  };
}

/** The transaction's title: click to rename it; the bank's text shows underneath once it has a name. */
export function NameHeading({
  transaction,
  onSuggestions,
  renderTitle,
}: {
  transaction: TransactionSchema;
  onSuggestions: (suggestions: NameSuggestion[]) => void;
  renderTitle: (title: ReactNode) => ReactNode;
}) {
  const refresh = useRefresh();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Enter and Escape both leave the field, which saves, unless it was Escape.
  const cancelled = useRef(false);
  const rename = useMutation({
    ...renameTransactionMutation({ client }),
    meta: { errorToast: false },
    onSuccess: (renamed) => {
      refresh({ id: renamed.id, name: renamed.name });
      onSuggestions(renamed.suggestions);
    },
    onError: (error) => toast.error(errorDetail(error, "Couldn't rename it")),
  });
  const save = (draft: string | null) => {
    setEditing(false);
    // The field starts out with the bank's text; leaving it as that is no name at all.
    const trimmed = draft?.trim() || null;
    const name = trimmed === transaction.description ? null : trimmed;
    if (name === (transaction.name ?? null)) return;
    rename.mutate({
      client,
      path: { transaction_id: transaction.id },
      body: { name },
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelled.current = true;
    }
    if (event.key === "Enter" || event.key === "Escape") {
      event.currentTarget.blur();
    }
  };
  const onBlur = () => {
    if (cancelled.current) {
      setEditing(false);
      return;
    }
    save(draft);
  };

  if (editing) {
    return (
      <TextInput
        autoFocus
        value={draft}
        maxLength={120}
        placeholder={transaction.description ?? "Name"}
        aria-label="Name"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className="h-8 type-heading"
      />
    );
  }
  return (
    <div className="min-w-0">
      {renderTitle(
        <button
          type="button"
          onClick={() => {
            setDraft(transaction.name ?? transaction.description ?? "");
            cancelled.current = false;
            setEditing(true);
          }}
          aria-label={`Rename ${displayName(transaction)}`}
          className="group flex max-w-full items-center gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60"
        >
          <span className="truncate">{displayName(transaction)}</span>
          <Pencil
            aria-hidden
            className="size-3 shrink-0 text-white/0 transition-colors group-hover:text-white/40 group-focus-visible:text-white/40 pointer-coarse:text-white/30"
          />
        </button>,
      )}
      {transaction.name && transaction.description && (
        <p className="truncate type-caption text-white/40">
          Bank text: {transaction.description}
          <button
            type="button"
            onClick={() => save(null)}
            className="ml-1.5 text-white/55 underline-offset-2 hover:text-white/80 hover:underline"
          >
            Use it
          </button>
        </p>
      )}
    </div>
  );
}

/** After a rename: others that likely want the same name, one tap each. */
export function NameSuggestions({
  name,
  description,
  suggestions,
  onDone,
}: {
  name: string;
  description: string | null | undefined;
  suggestions: NameSuggestion[];
  onDone: (description: string) => void;
}) {
  const refresh = useRefresh();
  const nameAll = useMutation({
    ...nameTransactionsMutation({ client }),
    meta: { errorToast: false },
    onSuccess: ({ renamed }, { body }) => {
      refresh();
      onDone(body.description);
      toast.success(
        `Renamed ${renamed} ${renamed === 1 ? "transaction" : "transactions"}`,
      );
    },
    onError: (error) => toast.error(errorDetail(error, "Couldn't rename them")),
  });
  if (suggestions.length === 0) return null;
  return (
    <section
      aria-label="Rename others"
      className="rounded-xl border border-primary-500/20 bg-primary-500/[0.06] p-3.5"
    >
      <p className="text-13 text-white/80">Call these "{name}" too?</p>
      <ul className="mt-2 space-y-1.5">
        {suggestions.map((suggestion) => (
          <li key={suggestion.description} className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-13 text-white/75">
                {suggestion.description}
              </span>
              <span className="type-caption text-white/40">
                {suggestion.description === description
                  ? `${suggestion.count} more with this bank text, and later ones`
                  : `${suggestion.count} ${suggestion.count === 1 ? "transaction" : "transactions"}, and later ones`}
              </span>
            </span>
            <SoftButton
              disabled={nameAll.isPending}
              onClick={() =>
                nameAll.mutate({
                  client,
                  body: {
                    description: suggestion.description,
                    name,
                    replacing: suggestion.replacing,
                  },
                })
              }
            >
              Rename
            </SoftButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The user's own words about this one transaction, saved when they leave the field. */
export function NoteField({ transaction }: { transaction: TransactionSchema }) {
  const refresh = useRefresh();
  const [draft, setDraft] = useState(transaction.note ?? "");
  // Read when the panel closes, which can take the field away before it loses focus.
  const latest = useRef({ draft, saved: transaction.note ?? null });
  latest.current.draft = draft;
  const update = useMutation({
    ...updateTransactionMutation({ client }),
    meta: { errorToast: false },
    onSuccess: (updated) => refresh({ id: updated.id, note: updated.note }),
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't save the note")),
  });
  const save = () => {
    const note = latest.current.draft.trim() || null;
    if (note === latest.current.saved) return;
    latest.current.saved = note;
    update.mutate({
      client,
      path: { transaction_id: transaction.id },
      body: { note: latest.current.draft },
    });
  };
  useEffect(() => save, []);
  return (
    <label className="block">
      <span className="mb-1.5 block type-section text-white/55">Note</span>
      <textarea
        value={draft}
        maxLength={1000}
        rows={2}
        placeholder="What it was for, who it was with..."
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.blur();
        }}
        onBlur={save}
        className="field-sizing-content min-h-16 w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-13 text-white/85 outline-none transition-colors duration-150 placeholder:text-white/25 hover:border-white/15 focus:border-primary-500/50 focus:bg-white/[0.06]"
      />
    </label>
  );
}
