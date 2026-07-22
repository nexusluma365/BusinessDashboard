import { ChevronDown, Moon, Search, Sun } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { useThemeStore } from "@/store/useThemeStore";

export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const { mode, toggle } = useThemeStore();
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <header className="relative z-40 flex items-center justify-between h-20 px-8 border-b border-border-subtle shrink-0 bg-bg-secondary/72 backdrop-blur-xl">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 premium-input rounded-card px-4 h-12 w-72">
          <Search size={14} className="text-text-muted" />
          <input
            placeholder="Search leads, offers, commands…"
            className="bg-transparent outline-none text-sm placeholder:text-text-muted w-full"
          />
          <kbd className="text-[10px] text-text-muted border border-border rounded px-1.5 py-0.5">K</kbd>
        </div>
        <span className="hidden sm:block text-xs text-text-muted">{today}</span>
        <button
          onClick={toggle}
          className="w-11 h-11 rounded-card bg-bg-panel border border-border flex items-center justify-center hover:bg-bg-panelHover transition-colors"
          aria-label="Toggle theme"
        >
          {mode === "light" ? <Sun size={16} className="text-accent-gold" /> : <Moon size={16} className="text-accent-gold" />}
        </button>
        <NotificationBell />
        <div className="hidden md:flex items-center gap-3 pl-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ffe0b5] via-[#8bbcff] to-[#3058d8] border border-border" />
          <div>
            <div className="text-sm font-semibold">Nexus Luma</div>
            <div className="text-[11px] text-text-muted">Admin</div>
          </div>
          <ChevronDown size={16} className="text-text-muted" />
        </div>
      </div>
    </header>
  );
}
