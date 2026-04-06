import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const PRIORITY_NOTIFICATION_ID = "journal-priority-reminder";

export async function schedulePriorityReminder(priorityText: string): Promise<void> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return;

  await cancelPriorityReminder();

  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 0, 0);

  if (target <= now) return;

  await Notifications.scheduleNotificationAsync({
    identifier: PRIORITY_NOTIFICATION_ID,
    content: {
      title: "Priority Check-in",
      body: `Remember: ${priorityText}`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: target,
    },
  });
}

export async function cancelPriorityReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(PRIORITY_NOTIFICATION_ID);
}
