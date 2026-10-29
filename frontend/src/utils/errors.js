/**
 * Turn any axios/API failure into one human-readable sentence.
 *
 * The backend wraps every error as { error, status_code, code, detail, errors? },
 * where `detail` is already a readable message. This also covers network
 * failures, timeouts, throttling and Blob bodies (file downloads).
 */
export function getErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  if (typeof error === "string") return error;

  if (error.code === "ECONNABORTED") return "The server took too long to respond. Please try again.";
  if (error.code === "ERR_CANCELED") return "";
  if (!error.response) {
    return typeof navigator !== "undefined" && navigator.onLine === false
      ? "You appear to be offline. Check your connection and try again."
      : "Cannot reach the server. Please try again shortly.";
  }

  const { status, data } = error.response;
  if (status === 429) return data?.detail || "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "The server encountered an error. Please try again or contact support.";

  if (data && typeof data === "object" && !(data instanceof Blob)) {
    if (typeof data.detail === "string" && data.detail) return data.detail;
    const first = firstFieldMessage(data.errors || data);
    if (first) return first;
  }
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested record was not found.";
  return fallback;
}

/** Field-level messages keyed by field name, for inline form errors. */
export function getFieldErrors(error) {
  const errors = error?.response?.data?.errors;
  if (!errors || typeof errors !== "object") return {};
  return Object.fromEntries(
    Object.entries(errors).map(([field, messages]) => [field, Array.isArray(messages) ? String(messages[0]) : String(messages)])
  );
}

/** Blob error bodies (responseType: "blob") must be parsed before use. */
export async function parseBlobError(error) {
  const data = error?.response?.data;
  if (data instanceof Blob && data.type.includes("json")) {
    try {
      error.response.data = JSON.parse(await data.text());
    } catch {
      /* leave as-is */
    }
  }
  return error;
}

function firstFieldMessage(errors) {
  for (const value of Object.values(errors || {})) {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length) return String(value[0]);
    if (value && typeof value === "object") {
      const nested = firstFieldMessage(value);
      if (nested) return nested;
    }
  }
  return null;
}
