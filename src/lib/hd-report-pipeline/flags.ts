/** Kill-switch for the new sectional HD report (rollback to legacy multi-pass). */
export function isHdSectionalReportEnabled(): boolean {
  const raw = process.env.HD_SECTIONAL_REPORT?.trim().toLowerCase();
  if (raw == null || raw === "") return true; // default ON
  return raw === "1" || raw === "true" || raw === "yes";
}
