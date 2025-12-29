import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AdminRoute } from "@/components/auth/AdminRoute";
import { GlobalAdminRoute } from "@/components/auth/GlobalAdminRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { GlobalAdminLayout } from "@/components/layout/GlobalAdminLayout";
import { AdminAuthProvider } from "@/hooks/useAdminAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Conversations from "./pages/Conversations";
import Kanban from "./pages/Kanban";
import Settings from "./pages/Settings";
import Contacts from "./pages/Contacts";
import Connections from "./pages/Connections";
import AIAgents from "./pages/AIAgents";
import AIAgentEdit from "./pages/AIAgentEdit";
import KnowledgeBase from "./pages/KnowledgeBase";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import { AdminDashboard, AdminTeam, AdminCompany, AdminSettings } from "./pages/admin";
import {
  GlobalAdminAuth,
  GlobalAdminDashboard,
  GlobalAdminCompanies,
  GlobalAdminConnections,
  GlobalAdminPlans,
  GlobalAdminUsers,
  GlobalAdminMonitoring,
  GlobalAdminSettings,
  GlobalAdminN8NSettings,
  GlobalAdminAuditLogs,
  GlobalAdminProvisioningDashboard,
} from "./pages/global-admin";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          
          {/* Protected routes with AppLayout */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
          </Route>
          
          <Route
            path="/conversations"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Conversations />} />
          </Route>
          
          <Route
            path="/kanban"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Kanban />} />
          </Route>
          
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Settings />} />
          </Route>
          
          <Route
            path="/contacts"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Contacts />} />
          </Route>
          
          <Route
            path="/connections"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Connections />} />
          </Route>
          
          <Route
            path="/ai-agents"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AIAgents />} />
          </Route>
          
          <Route
            path="/ai-agents/:id/edit"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AIAgentEdit />} />
          </Route>
          
          <Route
            path="/knowledge-base"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<KnowledgeBase />} />
          </Route>
          
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Profile />} />
          </Route>
          
          {/* Client Admin Routes - Protected by role (admin of law firm) */}
          <Route
            path="/admin"
            element={
              <AdminRoute allowedRoles={["admin"]}>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="team" element={<AdminTeam />} />
            <Route path="company" element={<AdminCompany />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
          
          {/* Global Admin Routes - MiauChat SaaS Administration */}
          <Route
            path="/global-admin/auth"
            element={
              <AdminAuthProvider>
                <GlobalAdminAuth />
              </AdminAuthProvider>
            }
          />
          
          <Route
            path="/global-admin"
            element={
              <AdminAuthProvider>
                <GlobalAdminRoute>
                  <GlobalAdminLayout />
                </GlobalAdminRoute>
              </AdminAuthProvider>
            }
          >
            <Route index element={<GlobalAdminDashboard />} />
            <Route path="companies" element={<GlobalAdminCompanies />} />
            <Route path="connections" element={<GlobalAdminConnections />} />
            <Route path="plans" element={<GlobalAdminPlans />} />
            <Route
              path="users"
              element={
                <GlobalAdminRoute allowedRoles={["super_admin"]}>
                  <GlobalAdminUsers />
                </GlobalAdminRoute>
              }
            />
            <Route path="monitoring" element={<GlobalAdminMonitoring />} />
            <Route
              path="settings"
              element={
                <GlobalAdminRoute allowedRoles={["super_admin"]}>
                  <GlobalAdminSettings />
                </GlobalAdminRoute>
              }
            />
            <Route path="n8n-settings" element={<GlobalAdminN8NSettings />} />
            <Route path="audit-logs" element={<GlobalAdminAuditLogs />} />
            <Route path="provisioning" element={<GlobalAdminProvisioningDashboard />} />
          </Route>
          
          {/* Catch-all route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
