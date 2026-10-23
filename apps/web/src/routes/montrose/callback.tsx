import { createFileRoute } from "@tanstack/react-router";
import { MontroseCallbackPage } from "@/components/montrose/montrose-callback";

export const Route = createFileRoute("/montrose/callback")({
  component: MontroseCallbackPage,
});
