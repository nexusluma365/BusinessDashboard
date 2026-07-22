import { NavLink } from "react-router-dom";
import { LogOut, Waves } from "lucide-react";
import { navItems } from "@/lib/navigation";
import { useSylusStore } from "@/store/useSylusStore";
import { useNotificationsStore } from "@/store/useNotificationsStore";
import { VoiceOrb } from "@/components/SylusPanel";

export default function Sidebar() {
  const sylusOpen = useSylusStore((s) => s.open);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  async function handleSylusClick() {
    if (!navigator.mediaDevices?.getUserMedia) {
      window.dispatchEvent(new CustomEvent("syrus:start-voice-request"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      window.dispatchEvent(new CustomEvent("syrus:start-voice-request"));
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("syrus:voice-error", {
          detail: error instanceof Error ? error.message : "Microphone permission was denied.",
        })
      );
    }
  }

  return (
    <aside className="h-full w-[248px] shrink-0 bg-bg-secondary/88 border-r border-border-subtle flex flex-col px-5 py-6 backdrop-blur-xl">
      <div className="flex items-center gap-3 mb-9">
        <div className="w-11 h-11 rounded-card bg-accent-gold text-white flex items-center justify-center shadow-glowGold">
          <Waves size={24} strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-base font-semibold tracking-normal">SYRUS</div>
          <div className="text-xs text-text-muted">Command Center</div>
        </div>
      </div>

      <nav className="flex-1 w-full space-y-2 overflow-y-auto pr-1">
        {navItems.map((item) =>
          item.path === "/syrus" ? (
            <button
              key={item.path}
              onClick={handleSylusClick}
              title={item.label}
              className={`group relative w-full h-12 flex items-center gap-3 rounded-card px-3 transition-all ${
                sylusOpen ? "bg-accent-gold text-white shadow-glowGold" : "text-text-secondary hover:bg-bg-panelHover hover:text-text-primary"
              }`}
            >
              <VoiceOrb active={sylusOpen} compact />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ) : (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              title={item.label}
              className={({ isActive }) =>
                `group relative w-full h-12 flex items-center gap-3 rounded-card px-4 transition-all ${
                  isActive
                    ? "bg-accent-gold text-white shadow-glowGold"
                    : "text-text-secondary hover:bg-bg-panelHover hover:text-text-primary"
                }`
              }
            >
              <item.icon size={18} strokeWidth={1.75} className="shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
              {item.path === "/notifications" && unreadCount > 0 ? (
                <span className="ml-auto min-w-5 rounded-pill bg-status-error px-2 py-0.5 text-center text-[10px] font-semibold text-white">{unreadCount}</span>
              ) : item.badge ? (
                <span className="ml-auto rounded-pill bg-status-error/10 px-2 py-0.5 text-[10px] text-status-error">{item.badge}</span>
              ) : null}
            </NavLink>
          )
        )}
      </nav>

      <div className="w-full pt-5">
        <button
          className="w-full h-12 flex items-center gap-3 rounded-card px-4 text-text-muted hover:bg-bg-panelHover hover:text-text-primary transition-colors"
          aria-label="Sign out"
        >
          <LogOut size={18} />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </aside>
  );
}
