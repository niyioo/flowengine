import { Link } from "react-router-dom";
import EmptyState from "../common/EmptyState";

export default function NotFoundPage() {
  return (
    <div className="card" style={{ marginTop: "var(--space-8)" }}>
      <EmptyState
        title="Page not found"
        message="The page you are looking for does not exist or has moved."
        action={<Link className="btn btn-primary btn-sm" to="/dashboard">Back to dashboard</Link>}
      />
    </div>
  );
}
