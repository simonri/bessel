import {
  type AddressPartsInput,
  getAddressOptions,
  suggestAddressesOptions,
} from "@bessel/client";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 3;

/**
 * An address field that suggests real addresses as it's typed. Picking one
 * fills in Google's way of writing it, with its parts and where it is; typing
 * after that makes it a plain typed address again.
 */
export function AddressInput({
  value,
  ariaLabel,
  placeholder,
  className,
  onChange,
}: {
  value: string;
  ariaLabel: string;
  placeholder: string;
  className?: string;
  /** `parts` is set when an address was picked, null when it was typed. */
  onChange: (value: string, parts: AddressPartsInput | null) => void;
}) {
  const queryClient = useQueryClient();
  const listId = useId();
  // One per address being typed: Google bills the typing and the pick as one session.
  const session = useRef(crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(value.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const { data } = useQuery({
    ...suggestAddressesOptions({
      client,
      query: { text: query, session: session.current },
    }),
    enabled: open && query.length >= MIN_CHARS,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    meta: { privateKey: true },
  });
  const suggestions =
    open && query.length >= MIN_CHARS ? (data?.suggestions ?? []) : [];

  const pick = async (placeId: string) => {
    setOpen(false);
    try {
      const parts = await queryClient.fetchQuery(
        getAddressOptions({
          client,
          path: { place_id: placeId },
          query: { session: session.current },
        }),
      );
      onChange(parts.formatted, parts);
    } catch {
      // Left as typed; it still saves as a plain address.
    }
    session.current = crypto.randomUUID();
  };

  return (
    <div className="relative min-w-0 flex-1">
      <input
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={
          suggestions.length > 0 ? `${listId}-${highlighted}` : undefined
        }
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value, null);
          setOpen(true);
          setHighlighted(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted(
              (i) => (i - 1 + suggestions.length) % suggestions.length,
            );
          } else if (e.key === "Enter") {
            e.preventDefault();
            void pick(suggestions[highlighted].place_id);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className={className}
      />
      {suggestions.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-lg bg-popover ring-1 ring-white/10 shadow-2xl">
          <ul id={listId} role="listbox" aria-label="Suggested addresses">
            {suggestions.map((s, i) => (
              <li
                key={s.place_id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === highlighted}
                // Picking happens before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  void pick(s.place_id);
                }}
                onMouseEnter={() => setHighlighted(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-2.5 py-1.5",
                  i === highlighted && "bg-white/[0.07]",
                )}
              >
                <MapPin className="size-3.5 shrink-0 text-white/35" />
                <span className="min-w-0 truncate text-13 text-white/85">
                  {s.main_text}
                  {s.secondary_text && (
                    <span className="text-white/40"> {s.secondary_text}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-white/[0.06] px-2.5 py-1 text-right text-10 text-white/30">
            Suggestions from Google
          </p>
        </div>
      )}
    </div>
  );
}
