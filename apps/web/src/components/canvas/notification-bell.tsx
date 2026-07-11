import {
  listNotificationsV1NotificationsGetOptions,
  listNotificationsV1NotificationsGetQueryKey,
  markAllNotificationsReadV1NotificationsReadAllPost,
  markNotificationReadV1NotificationsNotificationIdReadPost,
} from "@bessel/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, ExternalLink } from "lucide-react";
import { client } from "@/lib/client";

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
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: listNotificationsV1NotificationsGetQueryKey({ client }),
      }),
  });

  const markAllRead = useMutation({
    mutationFn: () =>
      markAllNotificationsReadV1NotificationsReadAllPost({ client }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: listNotificationsV1NotificationsGetQueryKey({ client }),
      }),
  });

  const kindColor: Record<string, string> = {
    info: "bg-sky-400",
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    error: "bg-red-400",
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500 text-9 font-bold leading-none text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex w-80 flex-col overflow-hidden rounded-xl border-white/10 bg-black/60 p-0 shadow-2xl backdrop-blur-xl"
        style={{ maxHeight: "min(28rem, 80vh)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
          <span className="text-sm font-medium text-white/80">
            Notifications
          </span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="text-11 text-sky-400 transition-colors hover:text-sky-300"
            >
              Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="py-8 text-center text-xs text-white/50">
            No notifications
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="divide-y divide-white/[0.06]">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.read_at) markRead.mutate(n.id);
                  }}
                  className={`group flex cursor-default items-start gap-2.5 px-4 py-3 transition-colors hover:bg-white/[0.04] ${
                    n.read_at ? "opacity-50" : ""
                  }`}
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      n.read_at
                        ? "bg-white/20"
                        : (kindColor[n.kind] ?? "bg-sky-400")
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-snug text-white/80">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-11 leading-snug text-white/50">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-10 text-white/50">
                      {formatDistanceToNow(new Date(n.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  {n.link && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.electron?.shell.openExternal(n.link!);
                      }}
                      title="Open link"
                      className="mt-0.5 shrink-0 text-white/20 opacity-0 transition-opacity hover:text-white/60 group-hover:opacity-100"
                    >
                      <ExternalLink className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
