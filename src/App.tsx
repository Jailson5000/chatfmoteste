import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlobalAdminRoute } from "@/components/auth/GlobalAdminRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlobalAdminLayout } from "@/components/layout/GlobalAdminLayout";
import { AdminAuthProvider } from "@/hooks/useAdminAuth";
import { TabSessionProvider } from "@/contexts/TabSessionContext";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";
import { Loader2 } from "lucide-react";

// Only Index and Auth are synchronous (landing + login = first screens)
import Index from "./pages/Index";
import Auth from "./pages/Auth";

// All other pages are lazy-loaded
const AuthCallback = React.lazy(() => import("./pages/AuthCallback"));
const MetaAuthCallback = React.lazy(() => import("./pages/MetaAuthCallback"));
const ResetPassword = React.lazy(() => import("./pages/ResetPassword"));
const ChangePassword = React.lazy(() => import("./pages/ChangePassword"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Conversations = React.lazy(() => import("./pages/Conversations"));
const Kanban = React.lazy(() => import("./pages/Kanban"));
const Settings = React.lazy(() => import("./pages/Settings"));
const Contacts = React.lazy(() => import("./pages/Contacts"));
const Connections = React.lazy(() => import("./pages/Connections"));
const AIAgents = React.lazy(() => import("./pages/AIAgents"));
const AIAgentEdit = React.lazy(() => import("./pages/AIAgentEdit"));
const Tasks = React.lazy(() => import("./pages/Tasks"));
const Onboarding = React.lazy(() => import("./pages/Onboarding"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const AgendaPro = React.lazy(() => import("./pages/AgendaPro"));
const KnowledgeBase = React.lazy(() => import("./pages/KnowledgeBase"));
const AIVoice = React.lazy(() => import("./pages/AIVoice"));
const Profile = React.lazy(() => import("./pages/Profile"));
const Register = React.lazy(() => import("./pages/Register"));
const PaymentSuccess = React.lazy(() => import("./pages/PaymentSuccess"));
const PrivacyPolicy = React.lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = React.lazy(() => import("./pages/TermsOfService"));
const PublicBooking = React.lazy(() => import("./pages/PublicBooking"));
const ConfirmAppointment = React.lazy(() => import("./pages/ConfirmAppointment"));
const Support = React.lazy(() => import("./pages/Support"));
const Tutorials = React.lazy(() => import("./pages/Tutorials"));

// Global Admin pages
const GlobalAdminAuth = React.lazy(() => import("./pages/global-admin/GlobalAdminAuth"));
const GlobalAdminDashboard = React.lazy(() => import("./pages/global-admin/GlobalAdminDashboard"));
const GlobalAdminCompanies = React.lazy(() => import("./pages/global-admin/GlobalAdminCompanies"));
const GlobalAdminConnections = React.lazy(() => import("./pages/global-admin/GlobalAdminConnections"));
const GlobalAdminPlans = React.lazy(() => import("./pages/global-admin/GlobalAdminPlans"));
const GlobalAdminPayments = React.lazy(() => import("./pages/global-admin/GlobalAdminPayments"));
const GlobalAdminUsers = React.lazy(() => import("./pages/global-admin/GlobalAdminUsers"));
const GlobalAdminMonitoring = React.lazy(() => import("./pages/global-admin/GlobalAdminMonitoring"));
const GlobalAdminSettings = React.lazy(() => import("./pages/global-admin/GlobalAdminSettings"));
const GlobalAdminN8NSettings = React.lazy(() => import("./pages/global-admin/GlobalAdminN8NSettings"));
const GlobalAdminAIAPIs = React.lazy(() => import("./pages/global-admin/GlobalAdminAIAPIs"));
const GlobalAdminAuditLogs = React.lazy(() => import("./pages/global-admin/GlobalAdminAuditLogs"));
const GlobalAdminProvisioningDashboard = React.lazy(() => import("./pages/global-admin/GlobalAdminProvisioningDashboard"));
const GlobalAdminAlertHistory = React.lazy(() => import("./pages/global-admin/GlobalAdminAlertHistory"));
const GlobalAdminTemplateBase = React.lazy(() => import("./pages/global-admin/GlobalAdminTemplateBase"));
const GlobalAdminAgentTemplates = React.lazy(() => import("./pages/global-admin/GlobalAdminAgentTemplates"));
const GlobalAdminTickets = React.lazy(() => import("./pages/global-admin/GlobalAdminTickets"));
const GlobalAdminTutorials = React.lazy(() => import("./pages/global-admin/GlobalAdminTutorials"));
const GlobalAdminOnboarding = React.lazy(() => import("./pages/global-admin/GlobalAdminOnboarding"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
    },
  },
});

const LazyFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TenantProvider>
      <TabSessionProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<LazyFallback />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Navigate to="/auth" replace />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/auth/meta-callback" element={<MetaAuthCallback />} />
                <Route path="/register" element={<Register />} />
                <Route path="/payment-success" element={<PaymentSuccess />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/change-password" element={<ChangePassword />} />
                <Route path="/privacidade" element={<PrivacyPolicy />} />
                <Route path="/termos" element={<TermsOfService />} />
                <Route path="/agendar/:slug" element={<PublicBooking />} />
                <Route path="/confirmar" element={<ConfirmAppointment />} />

                {/* Protected routes — TenantProvider + RealtimeSyncProvider inside AppLayout */}
                <Route path="/dashboard" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<Dashboard />} />
                </Route>
                <Route path="/conversations" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<Conversations />} />
                </Route>
                <Route path="/kanban" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<Kanban />} />
                </Route>
                <Route path="/settings" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<Settings />} />
                </Route>
                <Route path="/contacts" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<Contacts />} />
                </Route>
                <Route path="/connections" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<Connections />} />
                </Route>
                <Route path="/ai-agents" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<AIAgents />} />
                </Route>
                <Route path="/ai-agents/:id/edit" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<AIAgentEdit />} />
                </Route>
                <Route path="/knowledge-base" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<KnowledgeBase />} />
                </Route>
                <Route path="/ai-voice" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<AIVoice />} />
                </Route>
                <Route path="/calendar" element={<Navigate to="/agenda-pro" replace />} />
                <Route path="/agenda" element={<Navigate to="/agenda-pro" replace />} />
                <Route path="/agenda-pro" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<AgendaPro />} />
                </Route>
                <Route path="/profile" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<Profile />} />
                </Route>
                <Route path="/suporte" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<Support />} />
                </Route>
                <Route path="/tutoriais" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<Tutorials />} />
                </Route>
                <Route path="/tarefas" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<Tasks />} />
                </Route>
                <Route path="/onboarding" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<Onboarding />} />
                </Route>

                {/* Redirect /admin to /settings */}
                <Route path="/admin" element={<Navigate to="/settings" replace />} />
                <Route path="/admin/*" element={<Navigate to="/settings" replace />} />

                {/* Global Admin Routes — NO TenantProvider / RealtimeSyncProvider */}
                <Route
                  path="/global-admin/auth"
                  element={<AdminAuthProvider><GlobalAdminAuth /></AdminAuthProvider>}
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
                  <Route path="payments" element={<GlobalAdminPayments />} />
                  <Route path="users" element={<GlobalAdminRoute allowedRoles={["super_admin"]}><GlobalAdminUsers /></GlobalAdminRoute>} />
                  <Route path="monitoring" element={<GlobalAdminMonitoring />} />
                  <Route path="settings" element={<GlobalAdminRoute allowedRoles={["super_admin"]}><GlobalAdminSettings /></GlobalAdminRoute>} />
                  <Route path="n8n-settings" element={<GlobalAdminN8NSettings />} />
                  <Route path="ai-apis" element={<GlobalAdminAIAPIs />} />
                  <Route path="audit-logs" element={<GlobalAdminAuditLogs />} />
                  <Route path="provisioning" element={<GlobalAdminProvisioningDashboard />} />
                  <Route path="alert-history" element={<GlobalAdminAlertHistory />} />
                  <Route path="template-base" element={<GlobalAdminRoute allowedRoles={["super_admin"]}><GlobalAdminTemplateBase /></GlobalAdminRoute>} />
                  <Route path="agent-templates" element={<GlobalAdminAgentTemplates />} />
                  <Route path="tickets" element={<GlobalAdminTickets />} />
                  <Route path="tutorials" element={<GlobalAdminTutorials />} />
                  <Route path="onboarding" element={<GlobalAdminOnboarding />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </TabSessionProvider>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
