import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), ritual: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: db.query }));
vi.mock("@/lib/ritual-service", () => ({ getRitualById: db.ritual }));
import { getSavedReadingDocument, historyToDocument } from "@/lib/reports/saved-reading";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { db.query.mockReset().mockResolvedValue({ rows: [] }); db.ritual.mockReset().mockResolvedValue(null); });
describe("saved PDF content", () => {
  it("preserves full paid source and structured snapshot, not a teaser", () => {
    const snapshot = { majorLines: [{ name: "Линия жизни" }] };
    const doc = historyToDocument({ character_name: "tarolog", created_at: "2026-09-06", context_data: { type: "palm_reading", report: "ПОЛНЫЙ ОТЧЁТ", teaser: "SHORT", snapshot, tarotCards: [{ name: "Маг", position: "Ресурс", reversed: true }] } });
    expect(doc?.body).toBe("ПОЛНЫЙ ОТЧЁТ"); expect(doc?.snapshot).toEqual(snapshot);
    expect(doc?.cards).toEqual(["Ресурс: Маг (перевёрнутая)"]);
  });
  it("rejects invalid identifiers before database access", async () => {
    expect(await getSavedReadingDocument("owner", "../../secret")).toBeNull(); expect(db.query).not.toHaveBeenCalled();
  });
  it("scopes every lookup and denies a foreign ritual", async () => {
    db.ritual.mockResolvedValue({user_id:"foreign",status:"completed"});
    expect(await getSavedReadingDocument("owner", id)).toBeNull();
    for (const [sql,args] of db.query.mock.calls) { expect(sql).toContain("user_id=$2"); expect(args).toEqual([id,"owner"]); }
  });
  it("resolves matrix report linked to a session, retaining its dedicated snapshot page", async () => {
    db.query.mockImplementation(async (sql: string) => ({rows: sql.includes("FROM numerology_report_history") ? [{id,content:"matrix full",created_at:"2026-09-06",tool_id:"destiny_matrix"}] : []}));
    const doc=await getSavedReadingDocument("owner",id);
    expect(doc?.printPath).toBe(`/cabinet/numerology/matrix/${id}/print`);
    expect(db.query.mock.calls.find(([sql])=>sql.includes("FROM numerology_report_history"))?.[0]).toContain("n.session_id IN");
  });
  it("never silently truncates a long consultation", async () => {
    db.query.mockImplementation(async (sql: string) => ({rows: sql.includes("FROM sessions s") ? [{id,created_at:"2026-09-06",character_key:"tarolog"}] : sql.includes("FROM chat_messages") ? Array(501).fill({role:"assistant",content:"full"}) : []}));
    await expect(getSavedReadingDocument("owner",id)).rejects.toThrow("report_too_long");
  });
});
