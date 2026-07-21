import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, ExternalLink, X } from "lucide-react";
import { useNotificationsStore } from "@/store/useNotificationsStore";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markRead, markHandled } = useNotificationsStore();
  const recent = notifications.filter((item) => !item.handled).slice(0, 5);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative p-2 rounded-full bg-bg-panel border border-border hover:bg-bg-panelHover transition-colors"
        aria-label="Notifications"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 w-2.5 h-2.5 rounded-full bg-status-error ring-2 ring-bg-secondary" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[340px] rounded-card bg-bg-secondary border border-border shadow-card overflow-hidden">
          <div className="h-12 px-4 flex items-center justify-between border-b border-border-subtle">
            <div>
              <h2 className="text-sm font-semibold">Recent notifications</h2>
              <p className="text-[11px] text-text-muted">{unreadCount} new update{unreadCount === 1 ? "" : "s"}</p>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-panelHover">
              <X size={14} />
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {recent.map((notification) => (
              <div key={notification.id} className="px-4 py-3 border-b border-border-subtle last:border-0">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                      notification.unread ? "bg-status-error" : "bg-text-muted"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-medium truncate">{notification.title}</h3>
                      <span className="text-[10px] text-text-muted shrink-0">{notification.timeline}</span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">{notification.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      {notification.unread && (
                        <button onClick={() => markRead(notification.id)} className="text-[11px] text-accent-gold hover:text-text-primary">
                          Mark read
                        </button>
                      )}
                      <button
                        onClick={() => markHandled(notification.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-status-success"
                      >
                        <Check size={11} /> Clear
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {recent.length === 0 && <p className="px-4 py-8 text-sm text-text-muted text-center">No active notifications.</p>}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="h-11 px-4 flex items-center justify-center gap-2 border-t border-border-subtle text-xs text-accent-gold hover:bg-bg-panelHover"
          >
            View all notifications <ExternalLink size={12} />
          </Link>
        </div>
      )}
    </div>
  );
}
