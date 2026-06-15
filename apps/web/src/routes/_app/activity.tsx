import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/activity")({
  component: ActivityPage,
});

function ActivityPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Time tracking from the desktop monitor.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        No data yet. Run{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
          ./main.py --push
        </code>{" "}
        in{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
          services/monitor
        </code>{" "}
        to sync your activity history.
      </p>
    </div>
  );
}
