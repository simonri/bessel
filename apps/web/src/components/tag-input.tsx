import { useState, useRef } from "react";
import { X } from "lucide-react";

const PRESET_TAGS = [
  "lunch",
  "dinner",
  "breakfast",
  "brunch",
  "coffee",
  "drinks",
  "dessert",
  "date night",
  "family",
  "business",
  "takeaway",
  "fine dining",
  "casual",
  "street food",
  "rooftop",
  "hidden gem",
  "must try",
  "local favorite",
];

const TAG_COLORS = [
  "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800",
  "bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800",
  "bg-pink-500/10 text-pink-600 border-pink-200 dark:border-pink-800",
  "bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-800",
  "bg-teal-500/10 text-teal-600 border-teal-200 dark:border-teal-800",
  "bg-indigo-500/10 text-indigo-600 border-indigo-200 dark:border-indigo-800",
  "bg-rose-500/10 text-rose-600 border-rose-200 dark:border-rose-800",
  "bg-cyan-500/10 text-cyan-600 border-cyan-200 dark:border-cyan-800",
];

function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export function Tag({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${getTagColor(tag)}`}
    >
      {tag}
      {onRemove && (
        <button type="button" onClick={onRemove} className="hover:opacity-70 -mr-0.5">
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

export function TagDisplay({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Tag key={tag} tag={tag} />
      ))}
    </div>
  );
}

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagInput({ tags, onChange }: TagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (normalized && !tags.includes(normalized)) {
      onChange([...tags, normalized]);
    }
    setInput("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const filteredSuggestions = PRESET_TAGS.filter(
    (s) => !tags.includes(s) && (input ? s.includes(input.toLowerCase()) : true),
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          className="border-input bg-background flex flex-wrap items-center gap-1.5 rounded-md border px-2.5 py-2 min-h-[38px] cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          {tags.map((tag) => (
            <Tag key={tag} tag={tag} onRemove={() => removeTag(tag)} />
          ))}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              // Delay to allow click on suggestion
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            placeholder={tags.length === 0 ? "Add tags..." : ""}
            className="bg-transparent text-sm outline-none flex-1 min-w-[80px] placeholder:text-muted-foreground"
          />
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-[160px] overflow-y-auto">
            {filteredSuggestions.slice(0, 8).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addTag(suggestion)}
              >
                <span className={`size-2 rounded-full ${getTagColor(suggestion).split(" ")[0]}`} />
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
