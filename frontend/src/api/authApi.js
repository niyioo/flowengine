import api, { refreshAccessToken } from "./axios";

export const authApi = {
  /** Returns { access }; the refresh token arrives as an httpOnly cookie. */
  login: (credentials) => api.post("/auth/login/", credentials).then((r) => r.data),
  /** Exchanges the refresh cookie for an access token (throws when there is no session). */
  restoreSession: () => refreshAccessToken(),
  getMe: () => api.get("/auth/me/").then((r) => r.data),
  /** Revokes the session held in the cookie. Needs no access token. */
  logout: () => api.post("/auth/logout/", {}),
};
