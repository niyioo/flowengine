import { createAsyncThunk } from "@reduxjs/toolkit";
import { authApi } from "../../api/authApi";
import { authChannel } from "../../utils/authChannel";
import { getErrorMessage } from "../../utils/errors";
import { tokenStore } from "../../utils/tokenStore";

export const loginUser = createAsyncThunk("auth/loginUser", async (credentials, { rejectWithValue }) => {
  try {
    const { access } = await authApi.login(credentials);
    tokenStore.set(access);
    return await authApi.getMe();
  } catch (error) {
    tokenStore.clear();
    const message = error.response?.status === 401
      ? "Incorrect username or password."
      : getErrorMessage(error, "Sign-in failed. Please try again.");
    return rejectWithValue(message);
  }
});

/**
 * Runs once on boot: the access token lives only in memory, so a reload
 * exchanges the httpOnly refresh cookie for a new one. No cookie simply means
 * "not signed in"; a rejected cookie means the session expired.
 */
export const restoreSession = createAsyncThunk("auth/restoreSession", async (_, { rejectWithValue }) => {
  try {
    await authApi.restoreSession();
    return await authApi.getMe();
  } catch (error) {
    tokenStore.clear();
    const code = error.response?.data?.code;
    return rejectWithValue({
      expired: error.response?.status === 401 && code !== "no_session",
      offline: !error.response,
    });
  }
});

export const logoutUser = createAsyncThunk("auth/logoutUser", async () => {
  tokenStore.clear();
  authChannel.announceSignOut();
  // Best effort: the local session is already gone even if this fails.
  await authApi.logout().catch(() => {});
});
