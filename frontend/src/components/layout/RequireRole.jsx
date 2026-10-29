import { Navigate } from "react-router-dom";
import { useAppSelector } from "../../app/hooks";

/**
 * Hides pages from roles that cannot use them. This is a UX guard only —
 * the API enforces the same rules and is the actual security boundary.
 */
export default function RequireRole({ allow, children }) {
  const role = useAppSelector((state) => state.auth.user?.role);
  if (!allow.includes(role)) return <Navigate to="/dashboard" replace />;
  return children;
}
