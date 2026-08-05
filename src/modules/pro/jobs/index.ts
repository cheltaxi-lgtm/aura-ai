/**
 * Pro cron registration. S0: empty — jobs must not register when module is off.
 * Callers must check isProModuleEnabled() before scheduling.
 */

import { isProModuleEnabled } from "../config";

export type ProJobId =
  | "expire-deliveries"
  | "thread-close"
  | "retention-purge"
  | "usage-reconcile"
  | "abuse-scan";

/** Returns job ids that may run. Always [] when PRO_MODULE_ENABLED=false. */
export function listEnabledProJobs(): ProJobId[] {
  if (!isProModuleEnabled()) return [];
  // S1+: return concrete job ids when handlers exist.
  return [];
}
