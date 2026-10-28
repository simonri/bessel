import {
  correctMemoryFactMutation,
  forgetMemoryFactMutation,
  listMemoryFactsOptions,
  listMemoryFactsQueryKey,
  type MemoryFactSchema,
} from "@bessel/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import {
  SettingsError,
  SettingsLoading,
  SettingsSection,
} from "@/components/settings-ui";
import { IconButton, SoftButton, TextInput } from "@/components/ui-kit";
import { client } from "@/lib/client";

function matches(fact: MemoryFactSchema, words: string[]): boolean {
  const text =
    `${fact.area} ${fact.attribute} ${fact.statement}`.toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}

function useInvalidateFacts() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: listMemoryFactsQueryKey({ client }),
    });
}

function FactRow({ fact }: { fact: MemoryFactSchema }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.statement);
  const [confirmForget, setConfirmForget] = useState(false);
  const invalidate = useInvalidateFacts();
  const correct = useMutation({
    ...correctMemoryFactMutation({ client }),
    onSuccess: () => {
      setEditing(false);
      return invalidate();
    },
  });
  const forget = useMutation({
    ...forgetMemoryFactMutation({ client }),
    onSuccess: invalidate,
  });

  const save = (event: FormEvent) => {
    event.preventDefault();
    const statement = draft.trim();
    if (!statement || statement === fact.statement) {
      setEditing(false);
      return;
    }
    correct.mutate({ path: { fact_id: fact.id }, body: { statement } });
  };

  return (
    <li className="group flex items-center gap-3 py-2">
      <span className="w-40 shrink-0 truncate text-12 text-white/45">
        {fact.attribute}
      </span>
      {editing ? (
        <form onSubmit={save} className="flex min-w-0 flex-1 gap-2">
          <TextInput
            aria-label={`Correct ${fact.attribute}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
          />
          <SoftButton type="submit" disabled={correct.isPending}>
            Save
          </SoftButton>
        </form>
      ) : (
        <p className="min-w-0 flex-1 break-words text-13 text-white/80">
          {fact.statement}
          {fact.status === "hypothesis" && (
            <span className="ml-2 text-12 text-white/40">Guess</span>
          )}
        </p>
      )}
      {!editing && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {confirmForget ? (
            <SoftButton
              onClick={() => forget.mutate({ path: { fact_id: fact.id } })}
              onBlur={() => setConfirmForget(false)}
              disabled={forget.isPending}
              autoFocus
            >
              Forget it
            </SoftButton>
          ) : (
            <>
              <IconButton
                aria-label={`Correct ${fact.attribute}`}
                title="Correct"
                onClick={() => {
                  setDraft(fact.statement);
                  setEditing(true);
                }}
              >
                <Pencil />
              </IconButton>
              <IconButton
                destructive
                aria-label={`Forget ${fact.attribute}`}
                title="Forget"
                onClick={() => setConfirmForget(true)}
              >
                <Trash2 />
              </IconButton>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** Everything assistants have learned about the user, to look through and correct. */
export function KnownAboutYou() {
  const { data, isLoading, isError } = useQuery(
    listMemoryFactsOptions({ client }),
  );
  const [query, setQuery] = useState("");
  const facts = data?.facts ?? [];
  const areas = useMemo(() => {
    const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const byArea = new Map<string, MemoryFactSchema[]>();
    for (const fact of facts) {
      if (!matches(fact, words)) continue;
      const list = byArea.get(fact.area);
      if (list) list.push(fact);
      else byArea.set(fact.area, [fact]);
    }
    return [...byArea.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [facts, query]);
  const areaCount = new Set(facts.map((fact) => fact.area)).size;

  return (
    <SettingsSection
      title="What Claude knows about you"
      description="What the morning and evening reports, and any Claude chat, have learned. Correct anything that's wrong, and Claude takes your word over its own guesses."
    >
      {isLoading ? (
        <SettingsLoading />
      ) : isError ? (
        <div className="py-3">
          <SettingsError>Couldn't load what Claude knows.</SettingsError>
        </div>
      ) : facts.length ? (
        <div className="space-y-4 py-3">
          <div className="flex items-center gap-3">
            <TextInput
              aria-label="Search what Claude knows"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="max-w-64"
            />
            <span className="text-12 text-white/40 tabular-nums">
              {facts.length} {facts.length === 1 ? "fact" : "facts"} in{" "}
              {areaCount} {areaCount === 1 ? "area" : "areas"}
            </span>
          </div>
          {areas.length ? (
            areas.map(([area, items]) => (
              <section key={area} aria-label={area}>
                <h4 className="text-12 font-medium text-white/55">{area}</h4>
                <ul className="divide-y divide-white/[0.05]">
                  {items.map((fact) => (
                    <FactRow key={fact.id} fact={fact} />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="text-13 text-white/45">Nothing matches.</p>
          )}
        </div>
      ) : (
        <p className="py-3 text-13 text-white/45">
          Nothing yet. Claude adds what it learns here as the reports run and
          you talk to it.
        </p>
      )}
    </SettingsSection>
  );
}
