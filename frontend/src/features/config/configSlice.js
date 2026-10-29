import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { memosApi } from "../../api/memosApi";

/**
 * Platform configuration served by the backend (GET /api/config/):
 * input limits, status and role labels, the step target and the live-refresh
 * cadence. The UI reads these instead of hardcoding them, so a change to
 * backend/.env shows up everywhere.
 */
export const fetchPlatformConfig = createAsyncThunk("config/fetch", async (_, { rejectWithValue }) => {
  try {
    return await memosApi.getConfig();
  } catch {
    return rejectWithValue("Could not load platform settings.");
  }
});

const configSlice = createSlice({
  name: "config",
  initialState: { data: null, loadedAt: null, error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPlatformConfig.fulfilled, (state, action) => {
        state.data = action.payload;
        state.loadedAt = Date.now();
        state.error = null;
      })
      .addCase(fetchPlatformConfig.rejected, (state, action) => {
        state.error = action.payload; // keep the last good config
      });
  },
});

export default configSlice.reducer;
