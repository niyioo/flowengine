import { formatDateTime } from "../../utils/formatters";

/**
 * "Live · updated 20:41 · refreshes every 60 s" with a manual refresh button.
 * Shows a stale warning when the last successful update failed to refresh.
 */
export default function LiveStatus({ updatedAt, refreshMs, loading, error, onRefresh }) {
  const seconds = refreshMs ? Math.round(refreshMs / 1000) : null;
  return (
    <div className="live-status" aria-live="polite">
      <span className={`live-dot${error ? " stale" : ""}`} aria-hidden="true" />
      <span className="muted-small">
        {error ? "Not updating — " : seconds ? "Live · " : ""}
        {updatedAt ? `updated ${formatDateTime(updatedAt)}` : "loading"}
        {seconds && !error ? ` · every ${seconds} s` : ""}
      </span>
      <button className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={loading}>
        {loading ? "Refreshing…" : "↻ Refresh"}
      </button>
    </div>
  );
}
