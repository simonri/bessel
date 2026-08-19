import {
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { bracketMatching } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
} from "@codemirror/view";
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { obsidianKeymap } from "./editor/keymap";
import { editorModeFacet, livePreview } from "./editor/live-preview";
import { obsidianMarkdown } from "./editor/obsidian-markdown";
import { obsidianTheme } from "./editor/theme";
import { wikiLinkAutocomplete } from "./editor/wikilink-autocomplete";

export interface NoteEditorHandle {
  focus: () => void;
  /** Inserts at the cursor, replacing the selection. */
  insertText: (text: string) => void;
  getSelection: () => string;
  /** 0-based line. */
  scrollToLine: (line: number) => void;
}

export interface NoteEditorProps {
  /** The document. Only applied to the editor when it differs from the live doc (external reloads). */
  value: string;
  onChange: (value: string) => void;
  /** "source" shows raw markdown; "live" hides syntax away from the cursor like Obsidian's Live Preview. */
  mode: "source" | "live";
  /** Rels of all notes — drives `[[` autocomplete and resolved/unresolved link styling. */
  files: readonly string[];
  /** Headings of a note (for `[[note#` completion). */
  headingsFor?: (rel: string) => readonly string[];
  /** Rel of the note being edited (link resolution is relative to it). */
  fromRel: string;
  /** URL for an embedded asset rel (images in live preview), null if unknown. */
  resolveAsset: (rel: string) => string | null;
  /** A wikilink/tag was activated (Ctrl/Cmd-click, or plain click in live mode). */
  onOpenLink: (target: string, opts: { newTab: boolean }) => void;
  /** Image pasted/dropped: write it to the vault and return the rel to embed, or null to ignore. */
  onPasteImage?: (file: File) => Promise<string | null>;
  /** Ctrl/Cmd+S. */
  onSave?: () => void;
  readOnly?: boolean;
  className?: string;
}

const DEFAULT_CLASS_NAME =
  "h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto";

function isPosTouched(state: EditorState, pos: number): boolean {
  const lineNumber = state.doc.lineAt(pos).number;
  return state.selection.ranges.some((range) => {
    const from = state.doc.lineAt(range.from).number;
    const to = state.doc.lineAt(range.to).number;
    return lineNumber >= from && lineNumber <= to;
  });
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(
  function NoteEditor(
    {
      value,
      onChange,
      mode,
      files,
      headingsFor,
      fromRel,
      resolveAsset,
      onOpenLink,
      onPasteImage,
      onSave,
      readOnly,
      className,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const livePreviewCompartment = useRef(new Compartment()).current;
    const readOnlyCompartment = useRef(new Compartment()).current;
    const applyingExternalValue = useRef(false);

    const onChangeRef = useRef(onChange);
    const onOpenLinkRef = useRef(onOpenLink);
    const onPasteImageRef = useRef(onPasteImage);
    const onSaveRef = useRef(onSave);
    useLayoutEffect(() => {
      onChangeRef.current = onChange;
      onOpenLinkRef.current = onOpenLink;
      onPasteImageRef.current = onPasteImage;
      onSaveRef.current = onSave;
    });

    // Mount/destroy the view exactly once — all prop changes below reconfigure
    // compartments or update refs instead of recreating it.
    useLayoutEffect(() => {
      const parent = containerRef.current;
      if (!parent) return;

      const handleImageDrop = async (
        view: EditorView,
        file: File,
        pos: number,
      ) => {
        const handler = onPasteImageRef.current;
        if (!handler) return;
        const rel = await handler(file);
        if (!rel) return;
        const insert = `![[${rel}]]`;
        view.dispatch({
          changes: { from: pos, to: pos, insert },
          selection: { anchor: pos + insert.length },
        });
      };

      const linkClickHandler = (
        event: MouseEvent,
        view: EditorView,
      ): boolean => {
        const el = event.target as HTMLElement | null;
        const wikilinkEl = el?.closest<HTMLElement>(".cm-wikilink");
        const tagEl = el?.closest<HTMLElement>(".cm-tag");
        if (!wikilinkEl && !tagEl) return false;

        const modKey = event.ctrlKey || event.metaKey;
        const pos = view.posAtDOM(wikilinkEl ?? tagEl!);
        const isLive = view.state.facet(editorModeFacet) === "live";
        const plainLiveClick = isLive && !isPosTouched(view.state, pos);
        if (!modKey && !plainLiveClick) return false;

        event.preventDefault();
        const target = wikilinkEl
          ? (wikilinkEl.dataset.wikilinkTarget ?? "")
          : `#${tagEl!.dataset.tag ?? ""}`;
        onOpenLinkRef.current(target, { newTab: modKey });
        return true;
      };

      const state = EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          closeBrackets(),
          EditorView.lineWrapping,
          markdown({
            base: markdownLanguage,
            codeLanguages: languages,
            extensions: [obsidianMarkdown],
          }),
          livePreviewCompartment.of(
            livePreview(mode, { files, fromRel, resolveAsset, headingsFor }),
          ),
          wikiLinkAutocomplete(),
          readOnlyCompartment.of([
            EditorState.readOnly.of(!!readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          obsidianTheme,
          EditorView.contentAttributes.of({
            spellcheck: "false",
            autocorrect: "off",
            autocapitalize: "off",
          }),
          keymap.of([
            ...closeBracketsKeymap,
            ...historyKeymap,
            ...obsidianKeymap(() => onSaveRef.current?.()),
            ...searchKeymap,
            ...completionKeymap,
            indentWithTab,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingExternalValue.current) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            mousedown: linkClickHandler,
            paste: (event, view) => {
              const items = event.clipboardData?.items;
              if (!items || !onPasteImageRef.current) return false;
              const imageItem = Array.from(items).find((i) =>
                i.type.startsWith("image/"),
              );
              const file = imageItem?.getAsFile();
              if (!file) return false;
              event.preventDefault();
              void handleImageDrop(view, file, view.state.selection.main.from);
              return true;
            },
            drop: (event, view) => {
              const file = event.dataTransfer?.files?.[0];
              if (!file?.type.startsWith("image/") || !onPasteImageRef.current)
                return false;
              event.preventDefault();
              const pos =
                view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
                view.state.selection.main.from;
              void handleImageDrop(view, file, pos);
              return true;
            },
          }),
        ],
      });

      const view = new EditorView({ state, parent });
      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // Intentionally mount-only: value/mode/files/etc. are applied via the
      // effects below (compartment reconfigures) rather than recreating the view.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useLayoutEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: livePreviewCompartment.reconfigure(
          livePreview(mode, { files, fromRel, resolveAsset, headingsFor }),
        ),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, files, fromRel, resolveAsset, headingsFor]);

    useLayoutEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: readOnlyCompartment.reconfigure([
          EditorState.readOnly.of(!!readOnly),
          EditorView.editable.of(!readOnly),
        ]),
      });
    }, [readOnly]);

    // External reload: only push `value` into the doc when it actually
    // differs from the live doc, and let CodeMirror's own change-mapping
    // clamp/carry the existing selection through the replace.
    useLayoutEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      if (view.state.doc.toString() === value) return;
      applyingExternalValue.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
      applyingExternalValue.current = false;
    }, [value]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => viewRef.current?.focus(),
        insertText: (text) => {
          const view = viewRef.current;
          if (!view) return;
          view.dispatch(view.state.replaceSelection(text));
        },
        getSelection: () => {
          const view = viewRef.current;
          if (!view) return "";
          const { from, to } = view.state.selection.main;
          return view.state.sliceDoc(from, to);
        },
        scrollToLine: (line0) => {
          const view = viewRef.current;
          if (!view) return;
          const lineNumber = Math.min(
            Math.max(line0 + 1, 1),
            view.state.doc.lines,
          );
          const pos = view.state.doc.line(lineNumber).from;
          view.dispatch({
            effects: EditorView.scrollIntoView(pos, { y: "start" }),
          });
        },
      }),
      [],
    );

    return (
      <div ref={containerRef} className={className ?? DEFAULT_CLASS_NAME} />
    );
  },
);
