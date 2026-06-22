import { useWindowManager } from "./window-manager";
import { CanvasWindow } from "./canvas-window";
import { CanvasDock } from "./canvas-dock";
import { CanvasTopBar } from "./canvas-topbar";

export function CanvasShell() {
  const { windows } = useWindowManager();
  const rowCount = Math.max(1, Math.ceil(windows.length / 2));

  return (
    <div className="fixed inset-0">
      <img
        src="/image.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-black/30" />

      {/* Content area: between top bar and dock, no scroll */}
      <div className="relative flex h-full flex-col pt-12 pb-3.5">
        {windows.length > 0 && (
          <div
            className="grid flex-1 grid-cols-2 gap-4 px-3.5 min-h-0"
            style={{ gridTemplateRows: `repeat(${rowCount}, 1fr)` }}
          >
            {windows.map((w) => (
              <CanvasWindow key={w.id} entry={w} />
            ))}
          </div>
        )}
      </div>

      <CanvasTopBar />
      <CanvasDock />
    </div>
  );
}
