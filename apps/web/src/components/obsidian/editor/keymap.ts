import { EditorSelection } from "@codemirror/state";
import type { Command, KeyBinding } from "@codemirror/view";

function toggleWrap(mark: string): Command {
  return (view) => {
    const { state } = view;
    const changes = state.changeByRange((range) => {
      const before = state.doc.sliceString(
        Math.max(range.from - mark.length, 0),
        range.from,
      );
      const after = state.doc.sliceString(range.to, range.to + mark.length);
      if (before === mark && after === mark) {
        return {
          changes: [
            { from: range.from - mark.length, to: range.from },
            { from: range.to, to: range.to + mark.length },
          ],
          range: EditorSelection.range(
            range.from - mark.length,
            range.to - mark.length,
          ),
        };
      }
      return {
        changes: [
          { from: range.from, insert: mark },
          { from: range.to, insert: mark },
        ],
        range: EditorSelection.range(
          range.from + mark.length,
          range.to + mark.length,
        ),
      };
    });
    view.dispatch(state.update(changes, { scrollIntoView: true }));
    return true;
  };
}

function insertWikiLink(): Command {
  return (view) => {
    const { state } = view;
    const changes = state.changeByRange((range) => {
      const selected = state.doc.sliceString(range.from, range.to);
      const insert = `[[${selected}]]`;
      return {
        changes: [{ from: range.from, to: range.to, insert }],
        range: EditorSelection.cursor(range.from + 2 + selected.length),
      };
    });
    view.dispatch(state.update(changes, { scrollIntoView: true }));
    return true;
  };
}

export function obsidianKeymap(onSave?: () => void): readonly KeyBinding[] {
  return [
    {
      key: "Mod-s",
      run: () => {
        onSave?.();
        return true;
      },
      preventDefault: true,
    },
    { key: "Mod-b", run: toggleWrap("**") },
    { key: "Mod-i", run: toggleWrap("*") },
    { key: "Mod-k", run: insertWikiLink() },
  ];
}
