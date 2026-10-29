import { Suspense, useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { fetchPlatformConfig } from "../../features/config/configSlice";
import ErrorBoundary from "../common/ErrorBoundary";
import Loader from "../common/Loader";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const dispatch = useAppDispatch();
  const refreshSeconds = useAppSelector((s) => s.config.data?.live_refresh_seconds);

  // Platform settings: load once signed in, then re-sync so threshold changes
  // and the server's date rollover reach open sessions without a reload.
  useEffect(() => {
    dispatch(fetchPlatformConfig());
  }, [dispatch]);
  useEffect(() => {
    if (!refreshSeconds) return undefined;
    const timer = setInterval(() => dispatch(fetchPlatformConfig()), refreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [dispatch, refreshSeconds]);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Close the mobile drawer on navigation and with the Escape key.
  useEffect(() => setSidebarOpen(false), [pathname]);
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setSidebarOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="app-main">
        <Header onMenuToggle={openSidebar} menuOpen={sidebarOpen} />
        <main id="main-content" className="page-content" tabIndex={-1}>
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<Loader text="Loading page…" />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
