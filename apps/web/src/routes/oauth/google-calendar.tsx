import { createFileRoute } from "@tanstack/react-router";
import { GoogleCalendarCallbackPage } from "@/components/calendar/google-calendar-callback";

export const Route = createFileRoute("/oauth/google-calendar")({
  component: GoogleCalendarCallbackPage,
});
