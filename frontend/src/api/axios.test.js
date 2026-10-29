import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "../utils/tokenStore";
import api, { refreshAccessToken, setSessionExpiredHandler } from "./axios";

/** Fake transport: 401 unless the request carries the given valid token. */
function serverAccepting(validToken) {
  return vi.fn(async (config) => {
    if (config.headers?.Authorization === `Bearer ${validToken}`) {
      return { status: 200, data: { ok: true, url: config.url }, headers: {}, config };
    }
    const error = new Error("Unauthorized");
    error.config = config;
    error.response = { status: 401, data: { detail: "Token expired" }, headers: {}, config };
    throw error;
  });
}

describe("API client token refresh", () => {
  let expired;

  beforeEach(() => {
    tokenStore.set("old-access");
    expired = vi.fn();
    setSessionExpiredHandler(expired);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    tokenStore.clear();
  });

  it("refreshes once for concurrent 401s and replays every request", async () => {
    api.defaults.adapter = serverAccepting("new-access");
    const refresh = vi.spyOn(axios, "post").mockResolvedValue({ data: { access: "new-access" } });

    const results = await Promise.all([api.get("/a/"), api.get("/b/"), api.get("/c/")]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.data.url)).toEqual(["/a/", "/b/", "/c/"]);
    expect(tokenStore.get()).toBe("new-access");
    expect(expired).not.toHaveBeenCalled();
  });

  it("sends an empty JSON body — the refresh token travels only in the httpOnly cookie", async () => {
    const refresh = vi.spyOn(axios, "post").mockResolvedValue({ data: { access: "fresh" } });
    await refreshAccessToken();
    const [url, body, config] = refresh.mock.calls[0];
    expect(url).toMatch(/\/auth\/refresh\/$/);
    expect(body).toEqual({});
    expect(config.withCredentials).toBe(true);
  });

  it("ends the session when the refresh cookie is rejected", async () => {
    api.defaults.adapter = serverAccepting("never");
    vi.spyOn(axios, "post").mockRejectedValue({ response: { status: 401 } });

    await expect(api.get("/a/")).rejects.toBeTruthy();
    expect(expired).toHaveBeenCalledTimes(1);
    expect(tokenStore.get()).toBeNull();
  });

  it("does not try to refresh failed auth calls", async () => {
    api.defaults.adapter = serverAccepting("never");
    const refresh = vi.spyOn(axios, "post");

    await expect(api.post("/auth/login/", {})).rejects.toBeTruthy();
    await expect(api.post("/auth/logout/", {})).rejects.toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  });

  it("never persists tokens to web storage", async () => {
    const setItem = vi.fn();
    globalThis.localStorage = { setItem, getItem: () => null, removeItem: () => {} };
    globalThis.sessionStorage = { setItem, getItem: () => null, removeItem: () => {} };
    api.defaults.adapter = serverAccepting("new-access");
    vi.spyOn(axios, "post").mockResolvedValue({ data: { access: "new-access" } });

    await api.get("/a/");
    expect(setItem).not.toHaveBeenCalled();
  });
});
