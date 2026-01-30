import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { useMessageNotifications } from "@/hooks/useMessageNotifications";
import { usePresenceTracking } from "@/hooks/usePresenceTracking";
import { SystemAlertBanner } from "./SystemAlertBanner";
import { ImpersonationBanner } from "./ImpersonationBanner";

export function AppLayout() {
  // Enable real-time message notifications
  useMessageNotifications({ enabled: true });
  
  // Track user presence and last seen
  usePresenceTracking();

  const location = useLocation();
  const isConversations = location.pathname.startsWith("/conversations");

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      <ImpersonationBanner />
      <SystemAlertBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AppSidebar />
        <main
          className={
            isConversations
              ? "flex-1 h-full min-h-0 min-w-0 overflow-hidden transition-all duration-300"
              : "flex-1 h-full min-h-0 min-w-0 overflow-auto transition-all duration-300"
          }
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
