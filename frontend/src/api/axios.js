import axios from "axios";
import { tokenStore } from "../utils/tokenStore";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  // The refresh cookie is same-origin; this only matters if the API is ever
  // served from another origin with credentialed CORS.
  withCredentials: true,
});

// Called when the session can no longer be refreshed. Registered by main.jsx so
// this module stays free of store/router imports (avoids circular imports).
let onSessionExpired = () => window.location.assign("/login");

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Exchanges the httpOnly refresh cookie for a new access token.
 *
 * All tabs share the one cookie and every refresh rotates it, so two tabs
 * refreshing at once would invalidate each other. The Web Locks API makes
 * refreshes run one at a time across tabs; within a tab, concurrent callers
 * share a single in-flight request.
 */
let inFlight = null;

async function requestNewAccessToken() {
  const { data } = await axios.post(`${API_BASE_URL}/auth/refresh/`, {}, { timeout: 15000, withCredentials: true });
  tokenStore.set(data.access);
  return data.access;
}

export function refreshAccessToken() {
  if (!inFlight) {
    const run = () => requestNewAccessToken();
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    inFlight = (locks?.request ? locks.request("flowengine-token-refresh", run) : run())
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

const AUTH_ENDPOINTS = ["/auth/login/", "/auth/refresh/", "/auth/logout/"];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => original?.url?.includes(path));

    if (error.response?.status !== 401 || !original || original._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      const access = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${access}`;
      return api(original);
    } catch {
      tokenStore.clear();
      onSessionExpired();
      return Promise.reject(error);
    }
  }
);

export default api;
