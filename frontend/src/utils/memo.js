const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days elapsed since an ISO timestamp. */
export const daysSince = (iso, now = Date.now()) => Math.floor((now - new Date(iso).getTime()) / DAY_MS);

/** "Waiting 3 h", "Waiting 2 days" — how long a step has been with its approver. */
export function formatWaiting(iso, now = Date.now()) {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "Just arrived";
  if (hours < 24) return `Waiting ${hours} h`;
  const days = Math.floor(ms / DAY_MS);
  return `Waiting ${days} day${days === 1 ? "" : "s"}`;
}

/** "3.5 h" or "2.1 days" for the average approval time. */
export function formatDuration(hours) {
  if (hours == null) return "—";
  if (hours < 24) return `${hours} h`;
  return `${(hours / 24).toFixed(1)} days`;
}
