import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  accent?: "gold" | "info" | "success" | "warning" | "error";
};

const accentClasses: Record<NonNullable<Props["accent"]>, string> = {
  gold: "text-accent-gold bg-accent-goldMuted",
  info: "text-status-info bg-status-info/15",
  success: "text-status-success bg-status-success/15",
  warning: "text-status-warning bg-status-warning/15",
  error: "text-status-error bg-status-error/15",
};

export default function StatCard({ label, value, icon: Icon, trend, accent = "gold" }: Props) {
  return (
    <div className="panel panel-hover p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className={`w-7 h-7 rounded-full flex items-center justify-center ${accentClasses[accent]}`}>
          <Icon size={14} />
        </span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {trend && (
          <span
            className={`badge text-[11px] ${
              trend.positive ? "bg-status-success/15 text-status-success" : "bg-status-error/15 text-status-error"
            }`}
          >
            {trend.positive ? "↑" : "↓"} {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
