import {
  listNotificationsV1NotificationsGetOptions,
  listNotificationsV1NotificationsGetQueryKey,
  markAllNotificationsReadV1NotificationsReadAllPost,
  markNotificationReadV1NotificationsNotificationIdReadPost,
} from "@bessel/client";
import { Popover, PopoverTrigger } from "@bessel/ui/components/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowUpRight, Bell } from "lucide-react";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";
import {
  TOPBAR_PANEL_ACTION,
  TOPBAR_PANEL_ROW,
  TOPBAR_PANEL_ROW_ICON,
  TopbarPanel,
  TopbarPanelBody,
  TopbarPanelEmpty,
  TopbarPanelHeader,
} from "./topbar-panel";
import { TOPBAR_BADGE_RING, TOPBAR_ICON_BUTTON } from "./topbar-styles";
import { TopbarTooltip } from "./topbar-tooltip";

const KIND_COLOR: Record<string, string> = {
  info: "bg-sky-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  error: "bg-red-400",
};

export function NotificationBell() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...listNotificationsV1NotificationsGetOptions({ client }),
    refetchInterval: 30_000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unread_count ?? 0;

  const markRead = useMutation({
    mutationFn: (id: string) =>
      markNotificationReadV1NotificationsNotificationIdReadPost({
        client,
        path: { notification_id: id },
        throwOnError: true,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: listNotificationsV1NotificationsGetQueryKey({ client }),
      }),
  });

  const markAllRead = useMutation({
    mutationFn: () =>
      markAllNotificationsReadV1NotificationsReadAllPost({
        client,
        throwOnError: true,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: listNotificationsV1NotificationsGetQueryKey({ client }),
      }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <TopbarTooltip
          label={
            unreadCount > 0
              ? `Notifications - ${unreadCount} unread`
              : "Notifications"
          }
        >
          <button
            type="button"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            className={TOPBAR_ICON_BUTTON}
          >
            <Bell />
            {unreadCount > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary-500 px-1 text-9 font-semibold tabular-nums leading-none text-white",
                  TOPBAR_BADGE_RING,
                )}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </TopbarTooltip>
      </PopoverTrigger>
      <TopbarPanel>
        <TopbarPanelHeader
          title="Notifications"
          action={
            unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className={TOPBAR_PANEL_ACTION}
              >
                Mark all read
              </button>
            )
          }
        />
        <TopbarPanelBody>
          {notifications.length === 0 ? (
            <TopbarPanelEmpty>No notifications</TopbarPanelEmpty>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.read_at) markRead.mutate(n.id);
                }}
                className={cn(TOPBAR_PANEL_ROW, "items-start py-2")}
              >
                <span
                  className={cn(
                    "mt-[7px] size-1.5 shrink-0 rounded-full",
                    n.read_at
                      ? "bg-white/15"
                      : (KIND_COLOR[n.kind] ?? KIND_COLOR.info),
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <p
                      className={cn(
                        "min-w-0 flex-1 leading-snug",
                        n.read_at ? "text-white/50" : "text-white/85",
                      )}
                    >
                      {n.title}
                    </p>
                    <span className="shrink-0 text-12 text-white/40">
                      {formatDistanceToNowStrict(new Date(n.created_at))}
                    </span>
                  </div>
                  {n.body && (
                    <p className="mt-0.5 text-12 leading-snug text-white/45">
                      {n.body}
                    </p>
                  )}
                </div>
                {n.link && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.electron?.shell.openExternal(n.link!);
                    }}
                    title="Open link"
                    aria-label="Open link"
                    className={TOPBAR_PANEL_ROW_ICON}
                  >
                    <ArrowUpRight />
                  </button>
                )}
              </div>
            ))
          )}
        </TopbarPanelBody>
      </TopbarPanel>
    </Popover>
  );
}
