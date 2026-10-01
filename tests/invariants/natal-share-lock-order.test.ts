import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getPool, query } from "@/lib/db";
import { hasTestDb, installDbLifecycle } from "./db/setup";
const auth = vi.hoisted(() => ({ owner: "" }));
vi.mock("@/lib/require-auth", () => ({ requireProfileUserId: async () => ({ profileUserId: auth.owner }) }));
vi.mock("@/lib/api-guards", () => ({ enforceShareCreateRateLimit: async () => null, enforcePaidRouteRateLimit: async () => null }));
import { POST } from "@/app/api/report-shares/route";

describe.runIf(hasTestDb)("Natal share creation lock order", () => {
  installDbLifecycle();
  it("lets an owner-locked report writer finish while share creation waits", async () => {
    auth.owner = (await query("INSERT INTO users(name,gender,zodiac) VALUES('Share fixture','female','test') RETURNING id")).rows[0].id;
    const reportId = (await query("INSERT INTO natal_report_history(user_id,birth_fingerprint,engine_version,ephemeris,tradition,content) VALUES($1,'fixture','fixture','fixture','western','Private fixture report') RETURNING id", [auth.owner])).rows[0].id;
    const writer = await getPool().connect();
    let pending: Promise<Response> | undefined;
    try {
      await writer.query("BEGIN");
      await writer.query("SET LOCAL statement_timeout='1500ms'");
      await writer.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [auth.owner]);
      pending = POST(new NextRequest("http://localhost/api/report-shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportKind: "natal", reportId, sections: ["summary", "personality", "relationships", "career", "resources", "tensions", "currentPeriod", "recommendations"] }) }));
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        await writer.query("SELECT pg_stat_clear_snapshot()");
        if ((await writer.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR KEY SHARE%'")).rowCount) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 15));
      }
      expect(blocked).toBe(true);
      await writer.query("SELECT id FROM natal_report_history WHERE id=$1 FOR UPDATE", [reportId]);
      await writer.query("COMMIT");
      expect((await pending).status).toBe(201);
      expect((await query("SELECT count(*) FROM private_report_shares WHERE report_id=$1", [reportId])).rows[0].count).toBe("1");
    } finally { await writer.query("ROLLBACK"); writer.release(); await pending; }
  });
});
