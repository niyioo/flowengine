import { useAppSelector } from "../app/hooks";

/**
 * Live platform settings from the backend (GET /api/config/). `ready` is false
 * until the first load; callers should wait rather than fall back to made-up numbers.
 */
export default function usePlatformConfig() {
  const config = useAppSelector((s) => s.config.data);
  const error = useAppSelector((s) => s.config.error);

  return {
    ready: Boolean(config),
    error,
    config,
    limits: config?.limits,
    statuses: config?.statuses ?? [],
    priorities: config?.priorities ?? [],
    roles: config?.roles ?? [],
    stepTargetDays: config?.step_target_days,
    refreshMs: config ? config.live_refresh_seconds * 1000 : null,
  };
}
