import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "react-router-dom";
import { setSessionExpiredHandler } from "./api/axios";
import { router } from "./app/router";
import { store } from "./app/store";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { sessionEnded } from "./features/auth/authSlice";
import { restoreSession } from "./features/auth/authThunks";
import { authChannel } from "./utils/authChannel";
import { tokenStore } from "./utils/tokenStore";
import "./styles/globals.css";
import "./styles/flowengine.css";

// Refresh failed → end the session in-app (no full page reload).
setSessionExpiredHandler(() => {
  store.dispatch(sessionEnded({ expired: true }));
  router.navigate("/login", { replace: true });
});

// Signing out in one tab signs out every tab.
authChannel.onSignOut(() => {
  tokenStore.clear();
  if (store.getState().auth.user) {
    store.dispatch(sessionEnded({ expired: false }));
    router.navigate("/login", { replace: true });
  }
});

// The access token is memory-only: exchange the httpOnly refresh cookie on boot.
store.dispatch(restoreSession());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
);
