import { createFileRoute } from "@tanstack/react-router";
import { Counters } from "@/components/counters";

export const Route = createFileRoute("/_app/counters")({
  component: Counters,
});
