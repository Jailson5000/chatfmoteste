import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { useMessageNotifications } from "@/hooks/useMessageNotifications";

export function AppLayout() {
  // Enable real-time message notifications
  useMessageNotifications({ enabled: true });

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
