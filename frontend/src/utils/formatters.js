/**
 * Format a numeric value with up to 2 decimal places.
 * Returns "—" for null / undefined / NaN.
 */
export const formatNumber = (value, decimals = 2) => {
  const n = Number(value ?? NaN);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

export const formatPercent = (value) => {
  const n = Number(value ?? NaN);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
};

/**
 * Format a date string (YYYY-MM-DD or ISO) into a human-readable form.
 * Parses YYYY-MM-DD strings as local date to avoid UTC off-by-one shift.
 */
export const formatDate = (value) => {
  if (!value) return "—";
  // If plain date string (no time component), parse as local to avoid UTC shift
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-NG", {
      day: "numeric", month: "short", year: "numeric",
    });
  }
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric", month: "short", year: "numeric",
  });
};

export const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-NG", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

/** Today's date as YYYY-MM-DD in the user's local timezone (not UTC). */
export const todayISO = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
