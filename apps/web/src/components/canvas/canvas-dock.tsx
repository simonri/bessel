import { MODULE_REGISTRY, MODULE_ORDER } from "./module-registry";
import { useWindowManager } from "./window-manager";

export function CanvasDock() {
  const { toggleWindow, openWindow, isOpen } = useWindowManager();

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-0.5 rounded-2xl border border-white/10 bg-black/50 px-2 py-2 shadow-2xl backdrop-blur-xl">
        {MODULE_ORDER.map((key) => {
          const config = MODULE_REGISTRY[key];
          const Icon = config.icon;
          const active = isOpen(key);

          return (
            <button
              key={key}
              onClick={() => config.multiInstance ? openWindow(key) : toggleWindow(key)}
              className={`flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-all duration-150 ${
                active
                  ? "bg-orange-500/20 text-orange-300"
                  : "text-white/50 hover:bg-white/10 hover:text-white/80"
              }`}
              title={config.title}
            >
              <Icon className="size-4 shrink-0" />
              <span className="text-[10px] leading-none tracking-wide">
                {config.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
