import { query } from "@/lib/db";
import { getSavedReadingDocument } from "./saved-reading";
import { getJointReadingByToken, resolveJointParticipantRole } from "@/lib/joint-reading-service";
import { printPathKind } from "./pdf-policy";
import { getCompatibilityRecord } from "@/lib/services/natal-compatibility-service";
import { getUserMatrixReportById } from "@/lib/services/numerology-report-service";

/** Check availability before launching Chromium; pages still recheck ownership. */
export async function privatePdfAvailable(path: string, userId: string): Promise<boolean> {
  if (printPathKind(path) !== "private") return false;
  const parts=path.split("/");
  const id=parts.at(-2)!;
  if(path.startsWith("/joint-reading/")) {
    const row=await getJointReadingByToken(id);
    return Boolean(row && row.status === "completed" && resolveJointParticipantRole(row,userId));
  }
  if(path.startsWith("/cabinet/readings/")) return Boolean((await getSavedReadingDocument(userId,id))?.body.trim());
  if(path.startsWith("/cabinet/numerology/matrix/")) return Boolean((await getUserMatrixReportById(userId,id))?.content.trim());
  if(path.startsWith("/cabinet/astrology/compatibility/")) return Boolean((await getCompatibilityRecord(id,userId))?.report);
  const sources: Record<string,string> = {
    "/cabinet/astrology/reports/": "SELECT 1 FROM natal_report_history WHERE id=$1 AND user_id=$2 AND length(trim(content))>0",
    "/cabinet/human-design/reports/": "SELECT 1 FROM hd_reports WHERE id=$1 AND user_id=$2 AND (status='done' OR (status='pending' AND admin_rewrite_started_at IS NOT NULL)) AND length(trim(report_text))>0",
    "/cabinet/human-design/composite-reports/": "SELECT 1 FROM hd_composite_reports WHERE id=$1 AND user_id=$2 AND status='done' AND length(trim(report_text))>0",
    "/cabinet/numerology/matrix/": "SELECT 1 FROM numerology_report_history WHERE id=$1 AND user_id=$2 AND tool_id IN ('destiny_matrix','child_matrix','matrix_year_forecast','matrix_compatibility') AND length(trim(content))>0",
  };
  const sql=Object.entries(sources).find(([prefix])=>path.startsWith(prefix))?.[1];
  return sql ? (await query(sql,[id,userId])).rows.length>0 : false;
}
