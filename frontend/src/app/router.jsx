import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout";
import NotFoundPage from "../components/layout/NotFoundPage";
import ProtectedRoute from "../components/layout/ProtectedRoute";
import RequireRole from "../components/layout/RequireRole";
import LoginPage from "../features/auth/LoginPage";
import { ROLES } from "../utils/permissions";

// Pages are split into separate chunks so the first load stays small.
const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage"));
const MemoListPage = lazy(() => import("../features/memos/MemoListPage"));
const MemoFormPage = lazy(() => import("../features/memos/MemoFormPage"));
const MemoDetailPage = lazy(() => import("../features/memos/MemoDetailPage"));
const RoutesPage = lazy(() => import("../features/routes/RoutesPage"));
const UsersPage = lazy(() => import("../features/users/UsersPage"));

const RAISERS = [ROLES.ADMIN, ROLES.STAFF];

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "memos", element: <MemoListPage /> },
      { path: "memos/new", element: <RequireRole allow={RAISERS}><MemoFormPage /></RequireRole> },
      { path: "memos/:id", element: <MemoDetailPage /> },
      { path: "memos/:id/edit", element: <RequireRole allow={RAISERS}><MemoFormPage /></RequireRole> },
      { path: "routes", element: <RequireRole allow={[ROLES.ADMIN]}><RoutesPage /></RequireRole> },
      { path: "users", element: <RequireRole allow={[ROLES.ADMIN]}><UsersPage /></RequireRole> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
