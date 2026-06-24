import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export function ClaudeCode() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(crypto.randomUUID()).current;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !window.electron?.terminal) return;

    const terminal = new Terminal({
      theme: {
        background: "#0a0a0a",
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
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(el);
    fitAddon.fit();

    window.electron.terminal
      .spawn(sessionId, terminal.cols, terminal.rows)
      .catch((err: unknown) => {
        terminal.writeln(
          `\r\n\x1b[31mFailed to start terminal: ${err}\x1b[0m\r\n`
        );
      });

    const disposeInput = terminal.onData((data) => {
      window.electron!.terminal.sendInput(sessionId, data);
    });

    const unsubData = window.electron.terminal.onData(sessionId, (data) => {
      terminal.write(data);
    });

    const unsubExit = window.electron.terminal.onExit(sessionId, (code) => {
      terminal.writeln(
        `\r\n\x1b[33m[Process exited with code ${code}]\x1b[0m`
      );
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      window.electron!.terminal.resize(sessionId, terminal.cols, terminal.rows);
    });
    resizeObserver.observe(el);

    return () => {
      disposeInput.dispose();
      unsubData();
      unsubExit();
      resizeObserver.disconnect();
      terminal.dispose();
      window.electron?.terminal.kill(sessionId);
    };
  }, [sessionId]);

  return <div ref={containerRef} className="h-full w-full" style={{ background: "#0a0a0a" }} />;
}
