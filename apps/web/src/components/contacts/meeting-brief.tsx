import { getMeetingBriefOptions } from "@bessel/client";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/client";
import { useLocalDay } from "@/lib/local-day";
import { describeDate, describeLastSeen, upcomingDay } from "./contact-meta";

const lowerFirst = (text: string) =>
  text.charAt(0).toLowerCase() + text.slice(1);

/** Who of the user's contacts is at an event, what they last noted about each, and dates coming up. */
export function MeetingBrief({ eventId }: { eventId: string }) {
  const today = useLocalDay();
  const { data } = useQuery(
    getMeetingBriefOptions({ client, query: { calendar_event_id: eventId } }),
  );
  if (!data?.people.length) return null;
  return (
    <ul aria-label="Who's coming" className="mt-2.5 flex flex-col gap-1.5">
      {data.people.map((person) => {
        const note = person.recent.find((e) => e.note)?.note;
        return (
          <li key={person.contact.id} className="text-12">
            <p className="text-white/80">
              {person.contact.display_name}
              {!person.sure && <span className="text-white/40"> (maybe)</span>}
              <span className="text-white/40">
                {" - "}
                {lowerFirst(describeLastSeen(person.last_seen, today))}
              </span>
            </p>
            {note && <p className="truncate text-white/50">“{note}”</p>}
            {person.upcoming && (
              <p className="text-primary-300">
                {describeDate(person.upcoming.label, person.upcoming.years)} -{" "}
                {upcomingDay(person.upcoming.on, today)}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
