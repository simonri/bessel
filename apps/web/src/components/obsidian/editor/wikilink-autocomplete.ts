import {
  autocompletion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { linkTargetFor, parentOf, resolveLink } from "../lib/wikilinks";
import { livePreviewConfigFacet } from "./live-preview";

const NOTE_TRIGGER = /\[\[([^[\]]*)$/;
const HEADING_TRIGGER = /\[\[([^[\]#|]+)#([^\]]*)$/;

const MAX_RESULTS = 50;

function fuzzyMatch(label: string, query: string): boolean {
  if (!query) return true;
  return label.toLowerCase().includes(query.toLowerCase());
}

function wikiLinkCompletionSource(context: CompletionContext) {
  const { files, fromRel, headingsFor } = context.state.facet(
    livePreviewConfigFacet,
  );

  const headingMatch = context.matchBefore(HEADING_TRIGGER);
  if (headingMatch && headingsFor) {
    const m = HEADING_TRIGGER.exec(headingMatch.text);
    if (m) {
      const [, target, query] = m;
      const resolved = resolveLink(files, fromRel, target) ?? target;
      const headings = headingsFor(resolved);
      const options = headings
        .filter((h) => fuzzyMatch(h, query))
        .slice(0, MAX_RESULTS)
        .map((h) => ({ label: h, type: "text" }));
      if (!options.length) return null;
      const from = headingMatch.to - query.length;
      return { from, to: headingMatch.to, options, filter: false };
    }
  }

  const noteMatch = context.matchBefore(NOTE_TRIGGER);
  if (!noteMatch) return null;
  const m = NOTE_TRIGGER.exec(noteMatch.text);
  if (!m) return null;
  const query = m[1];

  const options = files
    .filter((rel) => fuzzyMatch(linkTargetFor(files, rel), query))
    .slice(0, MAX_RESULTS)
    .map((rel) => {
      const label = linkTargetFor(files, rel);
      return {
        label,
        detail: parentOf(rel) || undefined,
        type: "text",
        apply: (
          view: EditorView,
          _completion: unknown,
          from: number,
          to: number,
        ) => {
          const after = view.state.doc.sliceString(to, to + 2);
          const insert = after === "]]" ? label : `${label}]]`;
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + insert.length },
          });
        },
      };
    });

  if (!options.length) return null;
  const from = noteMatch.to - query.length;
  return { from, to: noteMatch.to, options, filter: false };
}

export function wikiLinkAutocomplete() {
  return autocompletion({
    override: [wikiLinkCompletionSource],
    activateOnTyping: true,
  });
}
