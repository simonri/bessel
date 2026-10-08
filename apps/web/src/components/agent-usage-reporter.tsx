import { syncAgentUsageV1AgentUsageSyncPost } from "@bessel/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { client } from "@/lib/client";
import { apiDate } from "@/lib/local-day";

const REPORT_EVERY_MS = 10 * 60 * 1000;

/**
 * Uploads this machine's Claude Code usage while the desktop app is open:
 * tokens from its transcripts and the plan's current limits. Renders nothing.
 */
export function AgentUsageReporter() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const api = window.electron?.agentUsage;
    if (!api) return;
    let running = false;

    const report = async () => {
      if (running) return;
      running = true;
      try {
        const snapshot = await api.collect();
        if (!snapshot.daily.length && !snapshot.rate_limits.length) return;
        await syncAgentUsageV1AgentUsageSyncPost({
          client,
          body: {
            daily: snapshot.daily.map((day) => ({
              ...day,
              date: apiDate(day.date),
            })),
            rate_limits: snapshot.rate_limits.map((limit) => ({
              ...limit,
              resets_at: limit.resets_at ? new Date(limit.resets_at) : null,
            })),
          },
          throwOnError: true,
        });
        await queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0] as { _id?: string } | undefined;
            return key?._id?.startsWith("getAgentUsage") ?? false;
          },
        });
      } catch (err) {
        // Background work: the panel's "Last updated" says when this stalls.
        console.warn("agent usage report failed", err);
      } finally {
        running = false;
      }
    };

    void report();
    const timer = setInterval(() => void report(), REPORT_EVERY_MS);
    return () => clearInterval(timer);
  }, [queryClient]);

  return null;
}
