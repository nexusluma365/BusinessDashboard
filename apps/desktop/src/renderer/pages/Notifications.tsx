import { Bell, Check, CheckCircle2, Clock, Trash2 } from "lucide-react";
import Header from "@/components/Header";
import { useNotificationsStore, type CommandNotification } from "@/store/useNotificationsStore";

export default function Notifications() {
  const { notifications, unreadCount, markRead, markHandled, clearHandled, clearAll } = useNotificationsStore();
  const active = notifications.filter((notification) => !notification.handled);
  const handled = notifications.filter((notification) => notification.handled);

  return (
    <div className="premium-page flex flex-col h-full">
      <Header title="Notifications" subtitle="Recent command-center updates, alerts, and follow-up items." />

      <div className="flex-1 overflow-y-auto px-7 py-6 space-y-5">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">New updates</span>
              <Bell size={16} className="text-status-error" />
            </div>
            <div className="text-[32px] leading-none font-semibold mt-4">{unreadCount}</div>
          </div>
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Active notifications</span>
              <Clock size={16} className="text-status-warning" />
            </div>
            <div className="text-[32px] leading-none font-semibold mt-4">{active.length}</div>
          </div>
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Cleared</span>
              <CheckCircle2 size={16} className="text-status-success" />
            </div>
            <div className="text-[32px] leading-none font-semibold mt-4">{handled.length}</div>
          </div>
        </section>

        <section className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Notification timeline</h2>
            <p className="text-sm text-text-muted mt-1">Clear an item once it has been answered or handled.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={clearHandled} className="h-10 px-4 rounded-card bg-bg-panel border border-border text-xs hover:bg-bg-panelHover">
              Remove cleared
            </button>
            <button onClick={clearAll} className="h-10 px-4 rounded-card bg-[#f7f4ff] text-[#141217] text-xs font-semibold">
              Clear all
            </button>
          </div>
        </section>

        <section className="premium-card overflow-hidden">
          {notifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onRead={() => markRead(notification.id)}
              onHandled={() => markHandled(notification.id)}
            />
          ))}
          {notifications.length === 0 && (
            <div className="px-4 py-14 text-center text-sm text-text-muted">No notifications right now.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function NotificationRow({
  notification,
  onRead,
  onHandled,
}: {
  notification: CommandNotification;
  onRead: () => void;
  onHandled: () => void;
}) {
  return (
    <div
      className={`px-5 py-4 border-b border-white/5 last:border-0 flex items-start gap-4 ${
        notification.handled ? "opacity-55" : "hover:bg-white/[0.03]"
      }`}
    >
      <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${notification.unread ? "bg-status-error" : "bg-text-muted"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">{notification.title}</h3>
          {notification.handled && <span className="badge bg-status-success/15 text-status-success text-[10px]">Cleared</span>}
        </div>
        <p className="text-sm text-text-secondary mt-1">{notification.description}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
          <Clock size={12} />
          {notification.timeline}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {notification.unread && !notification.handled && (
          <button onClick={onRead} className="w-9 h-9 rounded-card bg-bg-panel border border-border flex items-center justify-center hover:bg-bg-panelHover" title="Mark as read">
            <Check size={14} />
          </button>
        )}
        {!notification.handled && (
          <button onClick={onHandled} className="w-9 h-9 rounded-card bg-bg-panel border border-border flex items-center justify-center hover:bg-bg-panelHover" title="Clear once answered">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
