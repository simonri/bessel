import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { useWindowTitle } from "@/components/canvas/window-manager";

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
}

export function TerminalWidget({ command, args, cwd, taskDropZone = false }: TerminalWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const sessionId = useRef(crypto.randomUUID()).current;
  const spawnConfig = useRef({ command, args, cwd });
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isTaskDragging, setIsTaskDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const focusTerminal = useCallback(() => {
    // Defer past dnd-kit / HTML5 drag cleanup which resets browser focus
    requestAnimationFrame(() => {
      const textarea = containerRef.current?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
      textarea?.focus({ preventScroll: true });
    });
  }, []);

  const setWindowTitle = useWindowTitle();
  const setWindowTitleRef = useRef(setWindowTitle);
  useEffect(() => { setWindowTitleRef.current = setWindowTitle; });

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
      if ((e as CustomEvent<{ sessionId: string }>).detail.sessionId !== sessionId) return;
      focusTerminal();
    };
    window.addEventListener("metron:claude-drop", onDrop);
    return () => window.removeEventListener("metron:claude-drop", onDrop);
  }, [taskDropZone, sessionId]);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  const handleCopy = useCallback(async () => {
    const text = terminalRef.current?.getSelection();
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

    const terminal = new Terminal({
      allowTransparency: true,
      theme: {
        background: "transparent",
        foreground: "#e2e2e2",
        cursor: "#f97316",
        cursorAccent: "#0a0a0a",
        selectionBackground: "#f9731644",
        black: "#1a1a1a",
        red: "#ff5555",
        green: "#50fa7b",
        yellow: "#f1fa8c",
        blue: "#8be9fd",
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
      scrollback: 10_000,
      allowProposedApi: true,
    });

    terminalRef.current = terminal;

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(el);

    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    terminal.loadAddon(webgl);

    fitAddon.fit();

    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && e.ctrlKey && e.shiftKey && e.code === "KeyC") {
        const sel = terminal.getSelection();
        if (sel) navigator.clipboard.writeText(sel);
        return false;
      }
      return true;
    });

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        hasSelection: terminal.getSelection().length > 0,
      });
    };
    el.addEventListener("contextmenu", handleContextMenu, { capture: true });

    const { command: cmd, args: cmdArgs, cwd: cmdCwd } = spawnConfig.current;
    window.electron.terminal
      .spawn(sessionId, terminal.cols, terminal.rows, { command: cmd, args: cmdArgs, cwd: cmdCwd })
      .catch((err: unknown) => {
        terminal.writeln(`\r\n\x1b[31mFailed to start terminal: ${err}\x1b[0m\r\n`);
      });

    const disposeInput = terminal.onData((data) => {
      window.electron!.terminal.sendInput(sessionId, data);
    });

    const disposeTitleChange = terminal.onTitleChange((title) => {
      setWindowTitleRef.current?.(title || null);
    });

    const unsubData = window.electron.terminal.onData(sessionId, (data) => {
      terminal.write(data);
    });

    const unsubExit = window.electron.terminal.onExit(sessionId, (code) => {
      if (code !== 0) {
        terminal.writeln(`\r\n\x1b[31m[Process exited with code ${code}]\x1b[0m`);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      window.electron!.terminal.resize(sessionId, terminal.cols, terminal.rows);
    });
    resizeObserver.observe(el);

    return () => {
      disposeInput.dispose();
      disposeTitleChange.dispose();
      unsubData();
      unsubExit();
      resizeObserver.disconnect();
      el.removeEventListener("contextmenu", handleContextMenu, { capture: true });
      terminal.dispose();
      terminalRef.current = null;
      window.electron?.terminal.kill(sessionId);
    };
  }, []); // mount/unmount only — command/args/cwd are captured in spawnConfig ref

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
        onDragEnter={taskDropZone ? (e) => {
          if (Array.from(e.dataTransfer.types).includes("metron/task-prompt")) {
            dragCounterRef.current++;
            setIsDragOver(true);
          }
        } : undefined}
        onDragLeave={taskDropZone ? () => {
          dragCounterRef.current--;
          if (dragCounterRef.current === 0) setIsDragOver(false);
        } : undefined}
        onDragOver={taskDropZone ? (e) => {
          if (Array.from(e.dataTransfer.types).includes("metron/task-prompt")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        } : undefined}
        onDrop={taskDropZone ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounterRef.current = 0;
          setIsDragOver(false);
          const text = e.dataTransfer.getData("metron/task-prompt");
          if (text) {
            window.electron?.terminal.sendInput(sessionId, text);
            focusTerminal();
          }
        } : undefined}
      >
        <div ref={containerRef} className="h-full w-full" />
        {showDropOverlay && (
          <div
            className={`absolute inset-0 pointer-events-none flex items-center justify-center rounded border-2 transition-colors ${
              isDragOver
                ? "bg-orange-500/10 border-orange-500/50"
                : "bg-orange-500/5 border-orange-500/20"
            }`}
          >
            <span className="text-orange-400 text-sm font-medium bg-black/60 px-3 py-1.5 rounded-md">
              Drop to send to Claude
            </span>
          </div>
        )}
      </div>
      {contextMenu &&
        createPortal(
          <div
            style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 9999 }}
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
