import { createFileRoute } from "@tanstack/react-router";

// The index route keeps the pathless app layout matched at `/`; AppLayout owns
// the rendered shell and intentionally does not render a child outlet.
export const Route = createFileRoute("/_app/")({});
