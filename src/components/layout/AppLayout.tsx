import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { useMessageNotifications } from "@/hooks/useMessageNotifications";

export function AppLayout() {
  // Enable real-time message notifications
  useMessageNotifications({ enabled: true });

  const location = useLocation();
  const isConversations = location.pathname.startsWith("/conversations");

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <AppSidebar />
      <main className={isConversations ? "flex-1 min-h-0 overflow-hidden" : "flex-1 min-h-0 overflow-auto"}>
        <Outlet />
      </main>
    </div>
  );
}
