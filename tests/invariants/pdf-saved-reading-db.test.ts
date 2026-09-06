import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { query } from "@/lib/db";
import { createHistoryEntry } from "@/lib/users";
import { getSavedReadingDocument } from "@/lib/reports/saved-reading";
import { getActivePublicReportShare } from "@/lib/services/public-report-share-service";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser } from "./db/fixtures";
import { getNatalPrintRecord } from "@/lib/reports/natal-print-data";
import { privatePdfAvailable } from "@/lib/reports/private-pdf-access";

describe.skipIf(!hasTestDb)("PDF persisted ownership and historical data", () => {
  installDbLifecycle();
  it("exports only the owner full reading and stops after deletion", async () => {
    const owner=await createTestUser(), foreign=await createTestUser();
    const row=await createHistoryEntry({userId:owner.id,characterName:"tarolog",isPaid:true,contextData:{type:"photo_reading",analysis:"Сохранённый полный разбор",tarotCards:[{name:"Маг",position:0,reversed:true}]}});
    expect((await getSavedReadingDocument(owner.id,row.id))?.body).toBe("Сохранённый полный разбор");
    expect(await privatePdfAvailable(`/cabinet/readings/${row.id}/print`,owner.id)).toBe(true);
    expect(await privatePdfAvailable(`/cabinet/readings/${row.id}/print`,foreign.id)).toBe(false);
    expect(await getSavedReadingDocument(foreign.id,row.id)).toBeNull();
    await query("DELETE FROM history WHERE id=$1",[row.id]);
    expect(await getSavedReadingDocument(owner.id,row.id)).toBeNull();
    for (const prefix of ["readings", "astrology/reports", "astrology/compatibility", "human-design/reports", "human-design/composite-reports", "numerology/matrix"]) {
      expect(await privatePdfAvailable(`/cabinet/${prefix}/${row.id}/print`,owner.id)).toBe(false);
    }
  });
  it("uses matching natal JSON fingerprint, never a different current chart", async () => {
    const user=await createTestUser();
    const r=await query<{id:string}>(`INSERT INTO natal_report_history(user_id,birth_fingerprint,engine_version,ephemeris,tradition,content) VALUES($1,'original','pdf-test','test','western','Полный сохранённый натальный разбор') RETURNING id`,[user.id]);
    await query(`INSERT INTO natal_charts(user_id,engine_version,chart_data) VALUES($1,'pdf-test',$2)`,[user.id,JSON.stringify({birthFingerprint:"different",timeKnown:true,western:{sun:{longitude:45}}})]);
    const different=await getNatalPrintRecord(user.id,r.rows[0].id);expect(different?.chart_data).toBeNull();
    await query(`UPDATE natal_charts SET chart_data=jsonb_set(chart_data,'{birthFingerprint}','"original"') WHERE user_id=$1`,[user.id]);
    const matching=await getNatalPrintRecord(user.id,r.rows[0].id);expect(matching?.chart_data).not.toBeNull();
    const token=randomBytes(32).toString("base64url");
    await query(`INSERT INTO private_report_shares(owner_user_id,token,report_kind,report_id,selected_sections,public_payload,expires_at) VALUES($1,$2,'natal',$3,ARRAY['summary'],$4,NOW()+interval '1 hour')`,[user.id,token,r.rows[0].id,JSON.stringify({kind:"natal",summary:"Только выбранное"})]);
    expect((await getActivePublicReportShare(token))?.report).toEqual({kind:"natal",summary:"Только выбранное"});
    await query("UPDATE private_report_shares SET revoked_at=NOW() WHERE token=$1",[token]);expect(await getActivePublicReportShare(token)).toBeNull();
  });
});
