/**
 * Pro cron registration. Jobs listed only when module is enabled.
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
  return ["expire-deliveries", "thread-close", "retention-purge"];
}
