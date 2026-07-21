import { create } from "zustand";

export type CommandNotification = {
  id: string;
  title: string;
  description: string;
  timeline: string;
  type:
    | "new_lead"
    | "email_sent"
    | "text_received"
    | "takeover"
    | "status_change"
    | "call_booked"
    | "sale"
    | "payment_failed"
    | "update_available";
  unread: boolean;
  handled: boolean;
};

type NotificationsState = {
  notifications: CommandNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markHandled: (id: string) => void;
  clearHandled: () => void;
  clearAll: () => void;
};

const storageKey = "nexus-luma-notifications";

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: loadNotifications(),
  get unreadCount() {
    return get().notifications.filter((notification) => notification.unread && !notification.handled).length;
  },
  markRead: (id) =>
    set((state) => persist({ notifications: state.notifications.map((item) => (item.id === id ? { ...item, unread: false } : item)) })),
  markHandled: (id) =>
    set((state) =>
      persist({
        notifications: state.notifications.map((item) =>
          item.id === id ? { ...item, unread: false, handled: true } : item
        ),
      })
    ),
  clearHandled: () =>
    set((state) => persist({ notifications: state.notifications.filter((item) => !item.handled) })),
  clearAll: () => set(() => persist({ notifications: [] })),
}));

function loadNotifications() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]") as CommandNotification[];
    if (saved.length) return saved;
  } catch {
    /* Fall through to no notifications. */
  }

  return [];
}

function persist(patch: Pick<NotificationsState, "notifications">) {
  localStorage.setItem(storageKey, JSON.stringify(patch.notifications));
  return patch;
}
