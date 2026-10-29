/**
 * In-memory access token.
 *
 * Deliberately NOT persisted: anything in localStorage/sessionStorage can be
 * read by injected script. The long-lived refresh token is in an httpOnly
 * cookie the browser manages; after a reload the app silently exchanges it for
 * a new access token.
 */
let accessToken = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token) => {
    accessToken = token || null;
  },
  clear: () => {
    accessToken = null;
  },
};
