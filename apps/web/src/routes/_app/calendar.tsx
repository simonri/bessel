import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage } from "@/components/calendar/calendar-page";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});
