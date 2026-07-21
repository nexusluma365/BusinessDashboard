import {
  LayoutDashboard,
  Users,
  Kanban,
  MessagesSquare,
  Mail,
  Bell,
  Mic,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: number;
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7;
};

export const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard, phase: 1 },
  { label: "Leads", path: "/leads", icon: Users, badge: 5, phase: 2 },
  { label: "Pipeline", path: "/pipeline", icon: Kanban, phase: 2 },
  { label: "Conversations", path: "/conversations", icon: MessagesSquare, badge: 2, phase: 4 },
  { label: "Email Studio", path: "/email-studio", icon: Mail, phase: 4 },
  { label: "Notifications", path: "/notifications", icon: Bell, phase: 2 },
  { label: "SYRUS", path: "/syrus", icon: Mic, phase: 5 },
];
