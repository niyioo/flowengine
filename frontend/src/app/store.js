import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import configReducer from "../features/config/configSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    config: configReducer,
  },
});
