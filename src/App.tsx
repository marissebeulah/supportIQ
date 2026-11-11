import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { AppShell, type PortalKey } from "./components/AppShell";
import { Spinner } from "./components/ui";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import CustomerHomePage from "./pages/customer/HomePage";
import CustomerAssistantPage from "./pages/customer/AssistantPage";
import NewRequestPage from "./pages/customer/NewRequestPage";
import CustomerRequestsPage from "./pages/customer/RequestsPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import AgentDashboardPage from "./pages/agent/DashboardPage";
import AgentQueuePage from "./pages/agent/QueuePage";
import AgentReportsPage from "./pages/agent/ReportsPage";
import ReportsAccessDeniedPage from "./pages/customer/ReportsAccessDeniedPage";
import AdminOverviewPage from "./pages/admin/OverviewPage";
import AdminReportsPage from "./pages/admin/ReportsPage";
import AdminRequestsPage from "./pages/admin/RequestsPage";
import ConversationsPage from "./pages/admin/ConversationsPage";
import AutomationPage from "./pages/admin/AutomationPage";
import TeamPage from "./pages/admin/TeamPage";
import CustomersPage from "./pages/admin/CustomersPage";
import AccountsPage from "./pages/admin/AccountsPage";
import AdminPermissionsPage from "./pages/admin/PermissionsPage";
import InternalMessagesPage from "./pages/InternalMessagesPage";
import AppearancePage from "./pages/AppearancePage";
import SystemStatusPage from "./pages/SystemStatusPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";

function RequireAuth() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner label="Authenticating…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

function RoleGate({ allow }: { allow: ("customer" | "it" | "admin")[] }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!allow.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;
  return <Outlet />;
}

function homeForRole(role: "customer" | "it" | "admin") {
  if (role === "admin") return "/admin";
  if (role === "it") return "/agent";
  return "/portal";
}

function ReportsRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin/reports" replace />;
  if (user.role === "it") return <Navigate to="/agent/reports" replace />;
  return <Navigate to="/portal/reports" replace />;
}

function DashboardRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "it") return <Navigate to="/agent" replace />;
  return <Navigate to="/portal/dashboard" replace />;
}

function PortalLayout({ portal }: { portal: PortalKey }) {
  return (
    <AppShell portal={portal}>
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homeForRole(user.role)} replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to={homeForRole(user.role)} replace /> : <RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<RoleGate allow={["customer"]} />}>
          <Route element={<PortalLayout portal="customer" />}>
            <Route path="/portal" element={<CustomerHomePage />} />
            <Route path="/portal/assistant" element={<CustomerAssistantPage />} />
            <Route path="/portal/requests/new" element={<NewRequestPage />} />
            <Route path="/portal/new" element={<Navigate to="/portal/requests/new" replace />} />
            <Route path="/portal/requests" element={<CustomerRequestsPage />} />
            <Route path="/portal/requests/:id" element={<TicketDetailPage portal="customer" />} />
            <Route path="/portal/reports" element={<ReportsAccessDeniedPage />} />
            <Route path="/portal/dashboard" element={<ReportsAccessDeniedPage />} />
            <Route path="/portal/settings" element={<AppearancePage />} />
            <Route path="/portal/status" element={<SystemStatusPage />} />
          </Route>
        </Route>

        <Route element={<RoleGate allow={["it"]} />}>
          <Route element={<PortalLayout portal="it" />}>
            <Route path="/agent" element={<AgentDashboardPage />} />
            <Route path="/agent/dashboard" element={<Navigate to="/agent" replace />} />
            <Route path="/agent/reports" element={<AgentReportsPage />} />
            <Route path="/agent/queue" element={<AgentQueuePage scope="queue" />} />
            <Route path="/agent/mine" element={<AgentQueuePage scope="mine" />} />
            <Route path="/agent/resolved" element={<AgentQueuePage scope="resolved" />} />
            <Route path="/agent/messages" element={<InternalMessagesPage />} />
            <Route path="/agent/tickets/:id" element={<TicketDetailPage portal="it" />} />
            <Route path="/agent/settings" element={<AppearancePage />} />
            <Route path="/agent/status" element={<SystemStatusPage />} />
          </Route>
        </Route>

        <Route element={<RoleGate allow={["admin"]} />}>
          <Route element={<PortalLayout portal="admin" />}>
            <Route path="/admin" element={<AdminOverviewPage />} />
            <Route path="/admin/reports" element={<AdminReportsPage />} />
            <Route path="/admin/dashboard" element={<Navigate to="/admin" replace />} />
            <Route path="/admin/requests" element={<AdminRequestsPage />} />
            <Route path="/admin/requests/new" element={<NewRequestPage portal="admin" />} />
            <Route path="/admin/requests/:id" element={<TicketDetailPage portal="admin" />} />
            <Route path="/admin/conversations" element={<ConversationsPage />} />
            <Route path="/admin/automation" element={<AutomationPage />} />
            <Route path="/admin/team" element={<TeamPage />} />
            <Route path="/admin/customers" element={<CustomersPage />} />
            <Route path="/admin/accounts" element={<AccountsPage />} />
            <Route path="/admin/permissions" element={<AdminPermissionsPage />} />
            <Route path="/admin/messages" element={<InternalMessagesPage />} />
            <Route path="/admin/settings" element={<AppearancePage />} />
            <Route path="/admin/status" element={<SystemStatusPage />} />
          </Route>
        </Route>

        <Route path="/reports" element={<ReportsRoute />} />
        <Route path="/dashboard" element={<DashboardRoute />} />

        <Route index element={<Navigate to={user ? homeForRole(user.role) : "/login"} replace />} />
        <Route path="*" element={<Navigate to={user ? homeForRole(user.role) : "/login"} replace />} />
      </Route>
    </Routes>
  );
}
