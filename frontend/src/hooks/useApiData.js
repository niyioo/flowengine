import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../utils/errors";

const isVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

/**
 * Loads data for a page section, optionally keeping it live.
 *
 * - Cancels the previous request when inputs change (no stale responses
 *   overwriting newer ones) and on unmount.
 * - Keeps the last good data visible while reloading and after an error.
 * - With `refreshMs`, re-fetches on that interval while the tab is visible,
 *   pauses in background tabs, and refreshes as soon as the tab is shown again.
 *
 * `loader` receives { signal } and must return a promise.
 */
export default function useApiData(loader, deps = [], { fallbackError, refreshMs } = {}) {
  const [state, setState] = useState({ data: null, loading: true, error: "", updatedAt: null });
  const controllerRef = useRef(null);
  const inFlightRef = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);

  const run = useCallback(async ({ background = false } = {}) => {
    // A background tick never interrupts a load that is already running.
    if (background && inFlightRef.current) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    inFlightRef.current = true;

    if (!background) setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await load({ signal: controller.signal });
      if (!controller.signal.aborted) setState({ data, loading: false, error: "", updatedAt: new Date() });
    } catch (error) {
      if (controller.signal.aborted || error?.code === "ERR_CANCELED") return;
      setState((s) => ({ ...s, loading: false, error: getErrorMessage(error, fallbackError) }));
    } finally {
      if (controllerRef.current === controller) inFlightRef.current = false;
    }
  }, [load, fallbackError]);

  useEffect(() => {
    run();
    return () => controllerRef.current?.abort();
  }, [run]);

  useEffect(() => {
    if (!refreshMs) return undefined;
    const tick = () => isVisible() && run({ background: true });
    const timer = setInterval(tick, refreshMs);
    const onVisible = () => isVisible() && run({ background: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshMs, run]);

  return { ...state, reload: () => run() };
}
