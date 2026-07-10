import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "@xterm/xterm/css/xterm.css";
import {
  useWindowActions,
  useWindowEntry,
  useWindowTitle,
} from "@/components/canvas/window-manager";

interface ContextMenu {
  x: number;
  y: number;
  hasSelection: boolean;
}

interface TerminalWidgetProps {
  command: string;
  args: string[];
  cwd?: string;
  taskDropZone?: boolean;
  /** Commands run one after another once the shell/CLI has started. */
  commands?: string[];
}

// A command is only sent once the PTY has been quiet for this long — i.e. the
// shell/CLI has finished its startup burst (or a prior command's output) and
// is actually sitting at a prompt. Sending on a fixed delay instead races slower
// programs (ssh handshakes, the claude CLI) and can land input mid-startup,
// where it gets picked up twice by two different stages of that startup.
const IDLE_GAP_MS = 500;
const IDLE_POLL_MS = 100;
const POST_SEND_SETTLE_MS = 300;
const MAX_WAIT_PER_COMMAND_MS = 8000;

// xterm's FitAddon floors rows to the container height, so `.xterm` is
// usually a few px shorter than its container — the container needs this
// same background or that leftover strip shows the (translucent) widget
// chrome behind it instead of blending into the terminal.
const TERMINAL_BG = "#06060e";

export function TerminalWidget({
  command,
  args,
  cwd,
  taskDropZone = false,
  commands = [],
}: TerminalWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const sessionId = useRef(crypto.randomUUID()).current;
  const spawnConfig = useRef({ command, args, cwd, commands });
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const savedSelectionRef = useRef("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isTaskDragging, setIsTaskDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const focusTerminal = useCallback(() => {
    // Defer past dnd-kit / HTML5 drag cleanup which resets browser focus
    requestAnimationFrame(() => {
      const textarea = containerRef.current?.querySelector<HTMLTextAreaElement>(
        ".xterm-helper-textarea",
      );
      textarea?.focus({ preventScroll: true });
    });
  }, []);

  const setWindowTitle = useWindowTitle();
  const setWindowTitleRef = useRef(setWindowTitle);
  useEffect(() => {
    setWindowTitleRef.current = setWindowTitle;
  });

  const entry = useWindowEntry();
  const { closeWindow, updateWindowData } = useWindowActions();
  const closeWindowRef = useRef(closeWindow);
  useEffect(() => {
    closeWindowRef.current = closeWindow;
  });

  useEffect(() => {
    if (!taskDropZone) return;
    const onStart = () => setIsTaskDragging(true);
    const onEnd = () => setIsTaskDragging(false);
    window.addEventListener("metron:task-drag-start", onStart);
    window.addEventListener("metron:task-drag-end", onEnd);
    return () => {
      window.removeEventListener("metron:task-drag-start", onStart);
      window.removeEventListener("metron:task-drag-end", onEnd);
    };
  }, [taskDropZone]);

  useEffect(() => {
    if (!taskDropZone) return;
    const onDrop = (e: Event) => {
      const detail = (e as CustomEvent<{ sessionId: string; taskId?: string }>)
        .detail;
      if (detail.sessionId !== sessionId) return;
      focusTerminal();
      if (detail.taskId && entry)
        updateWindowData(entry.id, { attachedTaskId: detail.taskId });
    };
    window.addEventListener("metron:claude-drop", onDrop);
    return () => window.removeEventListener("metron:claude-drop", onDrop);
  }, [taskDropZone, sessionId, entry, updateWindowData]);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  const handleCopy = useCallback(async () => {
    const text = savedSelectionRef.current;
    if (text) await navigator.clipboard.writeText(text);
    closeMenu();
  }, [closeMenu]);

  const handlePaste = useCallback(async () => {
    const text = await navigator.clipboard.readText();
    if (text) window.electron?.terminal.sendInput(sessionId, text);
    closeMenu();
  }, [sessionId, closeMenu]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !window.electron?.terminal) return;

    const rootStyle = getComputedStyle(document.documentElement);
    const terminalCursor =
      rootStyle.getPropertyValue("--terminal-cursor").trim() || "#f97316";
    const terminalSelection =
      rootStyle.getPropertyValue("--terminal-selection").trim() || "#f9731644";

    const terminal = new Terminal({
      allowTransparency: false,
      theme: {
        background: TERMINAL_BG,
        foreground: "#e2e2e2",
        cursor: terminalCursor,
        cursorAccent: "#0a0a0a",
        selectionBackground: terminalSelection,
        black: "#1a1a1a",
        red: "#ff5555",
        green: "#50fa7b",
        yellow: "#f1fa8c",
        blue: "#7aa2f7",
        magenta: "#ff79c6",
        cyan: "#8be9fd",
        white: "#f8f8f2",
        brightBlack: "#6272a4",
        brightRed: "#ff6e6e",
        brightGreen: "#69ff94",
        brightYellow: "#ffffa5",
        brightBlue: "#d6acff",
        brightMagenta: "#ff92df",
        brightCyan: "#a4ffff",
        brightWhite: "#ffffff",
      },
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.0,
      cursorBlink: true,
      // Scrollback is the dominant per-terminal RAM cost, and every terminal
      // in every workspace stays mounted — keep the buffer widget-sized.
      scrollback: 4_000,
      allowProposedApi: true,
    });

    terminalRef.current = terminal;

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(el);

    let cancelled = false;

    // Chromium caps live WebGL contexts per page (~16) and evicts the oldest,
    // so with enough terminals across workspaces a context WILL be lost.
    // Without re-creating the addon, that terminal silently falls back to the
    // much slower DOM renderer forever — retry with backoff instead.
    let webglRetries = 0;
    const loadWebgl = () => {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
        if (cancelled || webglRetries >= 3) return;
        webglRetries += 1;
        setTimeout(() => {
          if (!cancelled) loadWebgl();
        }, 1000 * webglRetries);
      });
      terminal.loadAddon(webgl);
    };
    loadWebgl();

    fitAddon.fit();

    terminal.attachCustomKeyEventHandler((e) => {
      if (
        e.type === "keydown" &&
        e.ctrlKey &&
        e.shiftKey &&
        e.code === "KeyC"
      ) {
        const sel = terminal.getSelection();
        if (sel) navigator.clipboard.writeText(sel);
        return false;
      }
      return true;
    });

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        savedSelectionRef.current = terminal.getSelection();
      }
    };
    el.addEventListener("mousedown", handleMouseDown, { capture: true });

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        hasSelection: savedSelectionRef.current.length > 0,
      });
    };
    el.addEventListener("contextmenu", handleContextMenu, { capture: true });

    let hasStarted = false;
    const lastOutputAt = { current: Date.now() };
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    async function runQueuedCommands(cmds: string[]) {
      for (const line of cmds) {
        const deadline = Date.now() + MAX_WAIT_PER_COMMAND_MS;
        while (
          !cancelled &&
          Date.now() - lastOutputAt.current < IDLE_GAP_MS &&
          Date.now() < deadline
        ) {
          await sleep(IDLE_POLL_MS);
        }
        if (cancelled) return;
        window.electron?.terminal.sendInput(sessionId, `${line}\r`);
        await sleep(POST_SEND_SETTLE_MS);
      }
    }

    const {
      command: cmd,
      args: cmdArgs,
      cwd: cmdCwd,
      commands: queuedCommands,
    } = spawnConfig.current;
    window.electron.terminal
      .spawn(sessionId, terminal.cols, terminal.rows, {
        command: cmd,
        args: cmdArgs,
        cwd: cmdCwd,
      })
      .then(() => {
        if (queuedCommands.length > 0) void runQueuedCommands(queuedCommands);
      })
      .catch((err: unknown) => {
        terminal.writeln(
          `\r\n\x1b[31mFailed to start terminal: ${err}\x1b[0m\r\n`,
        );
      });

    const disposeInput = terminal.onData((data) => {
      window.electron!.terminal.sendInput(sessionId, data);
    });

    const disposeTitleChange = terminal.onTitleChange((title) => {
      setWindowTitleRef.current?.(title || null);
    });

    const unsubData = window.electron.terminal.onData(sessionId, (data) => {
      terminal.write(data);
      lastOutputAt.current = Date.now();
      hasStarted = true;
    });

    // Only auto-close on a clean exit once the shell has actually produced output —
    // i.e. it really started and was later exited, not a spawn that died before a
    // prompt ever appeared (which should surface as an error, not a silent close).
    const unsubExit = window.electron.terminal.onExit(sessionId, (code) => {
      if (code === 0 && hasStarted) {
        if (entry) closeWindowRef.current(entry.id);
      } else if (code !== 0) {
        terminal.writeln(
          `\r\n\x1b[31m[Process exited with code ${code}]\x1b[0m`,
        );
      }
    });

    // Debounced (not throttled): resizing the container mid-drag fires this
    // continuously, and resizing the PTY sends SIGWINCH to the child process,
    // making TUIs like the claude CLI repaint on every intermediate size. We
    // only want the final size once the drag settles, not a repaint per frame.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const { cols: prevCols, rows: prevRows } = terminal;
        fitAddon.fit();
        if (terminal.cols !== prevCols || terminal.rows !== prevRows) {
          window.electron!.terminal.resize(
            sessionId,
            terminal.cols,
            terminal.rows,
          );
        }
      }, 100);
    });
    resizeObserver.observe(el);

    return () => {
      cancelled = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      disposeInput.dispose();
      disposeTitleChange.dispose();
      unsubData();
      unsubExit();
      resizeObserver.disconnect();
      el.removeEventListener("mousedown", handleMouseDown, { capture: true });
      el.removeEventListener("contextmenu", handleContextMenu, {
        capture: true,
      });
      terminal.dispose();
      terminalRef.current = null;
      window.electron?.terminal.kill(sessionId);
    };
  }, []); // mount/unmount only — command/args/cwd/commands are captured in spawnConfig ref

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [contextMenu]);

  const showDropOverlay = taskDropZone && (isDragOver || isTaskDragging);

  return (
    <>
      <div
        {...(taskDropZone ? { "data-claude-session": sessionId } : {})}
        className="relative h-full w-full"
        style={{ backgroundColor: TERMINAL_BG }}
        onDragEnter={
          taskDropZone
            ? (e) => {
                if (
                  Array.from(e.dataTransfer.types).includes(
                    "metron/task-prompt",
                  )
                ) {
                  dragCounterRef.current++;
                  setIsDragOver(true);
                }
              }
            : undefined
        }
        onDragLeave={
          taskDropZone
            ? () => {
                dragCounterRef.current--;
                if (dragCounterRef.current === 0) setIsDragOver(false);
              }
            : undefined
        }
        onDragOver={
          taskDropZone
            ? (e) => {
                if (
                  Array.from(e.dataTransfer.types).includes(
                    "metron/task-prompt",
                  )
                ) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }
              }
            : undefined
        }
        onDrop={
          taskDropZone
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                dragCounterRef.current = 0;
                setIsDragOver(false);
                const text = e.dataTransfer.getData("metron/task-prompt");
                if (text) {
                  window.electron?.terminal.sendInput(sessionId, text);
                  focusTerminal();
                  const taskId = e.dataTransfer.getData("metron/task-id");
                  if (taskId) {
                    window.dispatchEvent(
                      new CustomEvent("metron:claude-drop", {
                        detail: { sessionId, taskId },
                      }),
                    );
                  }
                }
              }
            : undefined
        }
      >
        <div ref={containerRef} className="h-full w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent" />
        {showDropOverlay && (
          <div
            className={`absolute inset-0 pointer-events-none flex items-center justify-center rounded border-2 transition-colors ${
              isDragOver
                ? "bg-primary-500/10 border-primary-500/50"
                : "bg-primary-500/5 border-primary-500/20"
            }`}
          >
            <span className="text-primary-400 text-sm font-medium bg-black/60 px-3 py-1.5 rounded-md">
              Drop to send
            </span>
          </div>
        )}
      </div>
      {contextMenu &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 9999,
            }}
            className="overflow-hidden rounded-lg border border-white/10 bg-neutral-900/95 py-1 shadow-2xl backdrop-blur-xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCopy}
              disabled={!contextMenu.hasSelection}
              className="flex w-full items-center px-4 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-default"
            >
              Copy
            </button>
            <button
              onClick={handlePaste}
              className="flex w-full items-center px-4 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white"
            >
              Paste
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
