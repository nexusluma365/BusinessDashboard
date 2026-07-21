import { lazy, Suspense, useEffect } from "react";
import { Navigate, Routes, Route } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import SylusPanel from "@/components/SylusPanel";
import LockScreen from "@/pages/LockScreen";
import { useSecurityStore } from "@/store/useSecurityStore";
import { useThemeStore } from "@/store/useThemeStore";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Leads = lazy(() => import("@/pages/Leads"));
const Pipeline = lazy(() => import("@/pages/Pipeline"));
const Conversations = lazy(() => import("@/pages/Conversations"));
const EmailStudio = lazy(() => import("@/pages/EmailStudio"));
const Notifications = lazy(() => import("@/pages/Notifications"));

export default function App() {
  const { unlocked, checkKey } = useSecurityStore();
  const mode = useThemeStore((state) => state.mode);

  useEffect(() => {
    checkKey();
  }, [checkKey]);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  if (!unlocked) {
    return <LockScreen />;
  }

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/conversations" element={<Conversations />} />
            <Route path="/lead-text" element={<Navigate to="/conversations" replace />} />
            <Route path="/email-studio" element={<EmailStudio />} />
            <Route path="/templates" element={<Navigate to="/email-studio" replace />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <SylusPanel />
    </div>
  );
}

function RouteLoading() {
  return (
    <div className="premium-page flex h-full items-center justify-center">
      <div className="premium-card px-5 py-3 text-sm text-text-secondary">Loading SYRUS...</div>
    </div>
  );
}
