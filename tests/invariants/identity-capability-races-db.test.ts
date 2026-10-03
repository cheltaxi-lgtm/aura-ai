import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getPool, query } from "@/lib/db";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const cookie = vi.hoisted(() => ({ token: "", set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "aura_auth" && cookie.token ? { value: cookie.token } : undefined, set: cookie.set }) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => true), passwordResetEmailHtml: vi.fn(() => ""), passwordChangedEmailHtml: vi.fn(() => ""), jointReadingCompletedEmailHtml: vi.fn(() => ""), jointReadingPartnerDoneEmailHtml: vi.fn(() => ""), jointReadingExpiringEmailHtml: vi.fn(() => "") }));
vi.mock("@/lib/api-guards", () => ({ clientIp: () => "127.0.0.1", enforcePaidRouteRateLimit: async () => null, enforceSessionCreateRateLimit: async () => null, enforceShareCreateRateLimit: async () => null }));
vi.mock("@/lib/recaptcha-guard", () => ({ enforceRecaptchaScope: async () => null }));
vi.mock("@/lib/maintenance-mode", () => ({ fetchMaintenanceModeActive: async () => false, isMaintenanceBypassPath: () => false, isSearchEngineBot: () => false, MAINTENANCE_BOT_RETRY_AFTER_SEC: 60, MAINTENANCE_PAGE_PATH: "/maintenance" }));

import { completePasswordReset } from "@/lib/password-reset";
import { applyAuthCookie, getAuth, setAuthCookie, signToken, verifyPassword, verifyTokenWithVersion } from "@/lib/auth";
import { createOAuthHandoff, consumeOAuthHandoff } from "@/lib/oauth/storage";
import { findExpertByEmail } from "@/lib/accounts";
import { resolveSessionForUser } from "@/lib/session-access";
import { signSessionClaim } from "@/lib/session-claim";
import { processDueAccountErasures, requestAccountErasure } from "@/lib/account-erasure";
import { deleteUserAccountCompletely } from "@/lib/user-deletion";
import { logEmailAttempt } from "@/lib/email/log";
import { getSession } from "@/lib/session";
import { createShareSnapshot } from "@/lib/share/create-snapshot";
import { getShareSnapshotByToken } from "@/lib/share/get-snapshot";
import { getActivePublicReportShare } from "@/lib/services/public-report-share-service";
import { getJointReadingByToken, listJointReadingsForUser } from "@/lib/joint-reading-service";
import { getIntakeFormPublicMeta, submitIntake } from "@/modules/pro/db/intake";
import { getPublishedLandingBySlug } from "@/modules/pro/db/landings";
import { getProPool, proQuery } from "@/modules/pro/db";
import { mintProToken } from "@/modules/pro/tokens";
import { middleware } from "@/middleware";
import { signReminderUnsubscribeToken } from "@/lib/reminder-unsubscribe";
import { GET as unsubscribe } from "@/app/api/notifications/unsubscribe/route";
import { GET as jointGet } from "@/app/api/joint-reading/[token]/route";
import { PATCH as sessionPatch } from "@/app/api/session/route";
import { POST as paymentCreate } from "@/app/api/payment/create/route";

describe.runIf(hasTestDb)("identity capabilities and accepted erasure (real PostgreSQL)", () => {
  installDbLifecycle();
  const privileged: { table: "admin_accounts" | "expert_accounts"; id: string }[] = [];
  const accountIds: string[] = [];
  beforeAll(async () => {
    for (const file of ["102_migrate_pro_schema.sql", "103_migrate_pro_delivery_billing.sql", "112_migrate_pro_landing.sql", "113_migrate_pro_case_type_hd.sql", "121_migrate_pro_thread_msg_idem.sql", "123_migrate_pro_case_cost_rub.sql", "168_pro_hd_delivery_receipts.sql"]) {
      await getProPool().query(readFileSync(`scripts/migrations/${file}`, "utf8"));
    }
  });
  beforeEach(async () => {
    cookie.token = ""; cookie.set.mockClear();
    await proQuery("TRUNCATE pro.accounts RESTART IDENTITY CASCADE");
  });
  afterEach(async () => {
    await query("DELETE FROM email_log WHERE template = 'privacy_fixture'");
    await query("DELETE FROM account_erasure_jobs WHERE account_id = ANY($1::uuid[])", [accountIds]);
    accountIds.length = 0;
    for (const row of privileged) await query(`DELETE FROM ${row.table} WHERE id = $1`, [row.id]);
    privileged.length = 0;
    vi.unstubAllEnvs();
  });
  async function account(withProfile = true) {
    const pid = randomUUID(), aid = randomUUID();
    accountIds.push(aid);
    if (withProfile) await query("INSERT INTO users(id,name,gender,zodiac) VALUES($1,'Privacy fixture','female','')", [pid]);
    await query("INSERT INTO user_accounts(id,email,name,profile_user_id) VALUES($1,$2,'Privacy fixture',$3)", [aid, `${aid}@privacy.test`, withProfile ? pid : null]);
    return { aid, pid };
  }
  async function login(aid: string) {
    cookie.token = await signToken({ sub: aid, role: "user", email: "fixture@privacy.test", name: "Fixture", tv: 0 });
  }
  async function resetToken(aid: string) {
    const token = randomBytes(32).toString("hex");
    await query("INSERT INTO password_reset_tokens(user_account_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')", [aid, createHash("sha256").update(token).digest("hex")]);
    return token;
  }
  async function proFixture() {
    const owner = await account();
    const id = (await proQuery("INSERT INTO pro.accounts(user_id,status,tier,brand_slug) VALUES($1,'active','pro',$2) RETURNING id", [owner.pid, `fixture-${owner.aid}`])).rows[0].id;
    const token = mintProToken("zf");
    const formId = (await proQuery("INSERT INTO pro.intake_forms(account_id,name,token_hash,token_prefix,schema) VALUES($1,'Fixture brief',$2,$3,'{}') RETURNING id", [id, token.hash, token.tokenPrefix])).rows[0].id;
    await proQuery("INSERT INTO pro.landings(account_id,published,intake_form_id,intake_url) VALUES($1,TRUE,$2,$3)", [id, formId, `/pro/f/${token.raw}`]);
    return { ...owner, id, formId, token: token.raw, slug: `fixture-${owner.aid}` };
  }

  it("allows exactly one concurrent reset and revokes every old login capability", async () => {
    const { aid } = await account();
    const token = await resetToken(aid);
    const handoff = await createOAuthHandoff(aid, 0);
    const oldJwt = await signToken({ sub: aid, role: "user", email: "fixture@privacy.test", name: "Fixture", tv: 0 });
    const outcomes = await Promise.all(["new-password-one", "new-password-two"].map(p => completePasswordReset(token, p)));
    expect(outcomes.filter(result => result.ok)).toHaveLength(1);
    const row = (await query("SELECT password_hash,token_version FROM user_accounts WHERE id=$1", [aid])).rows[0];
    expect(row.token_version).toBe(1);
    const matches = await Promise.all(["new-password-one", "new-password-two"].map(p => verifyPassword(p, row.password_hash)));
    expect(matches.filter(Boolean)).toHaveLength(1);
    expect(await consumeOAuthHandoff(handoff)).toBeNull();
    expect(await verifyTokenWithVersion(oldJwt)).toBeNull();
    await expect(createOAuthHandoff(aid, 0)).rejects.toThrow("handoff_session_revoked");
    const fresh = await createOAuthHandoff(aid, 1);
    expect(await consumeOAuthHandoff(fresh)).toEqual({ accountId: aid, tokenVersion: 1 });
  });

  it("consumes a handoff once under concurrent requests", async () => {
    const { aid } = await account();
    const token = await createOAuthHandoff(aid);
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeOAuthHandoff(token)));
    expect(results.filter(Boolean)).toEqual([{ accountId: aid, tokenVersion: 0 }]);
  });

  it("cannot upgrade a consumed pre-reset handoff when attaching a cookie", async () => {
    const { aid } = await account();
    const handoff = await consumeOAuthHandoff(await createOAuthHandoff(aid));
    expect((await completePasswordReset(await resetToken(aid), "rotated-password")).ok).toBe(true);
    const payload = { sub: aid, role: "user" as const, email: "fixture@privacy.test", name: "Fixture", tv: handoff!.tokenVersion };
    expect(await setAuthCookie(payload)).toBe(false);
    const response = { cookies: { set: vi.fn() } };
    expect(await applyAuthCookie(response, payload)).toBe(false);
    expect(cookie.set).not.toHaveBeenCalled();
    expect(response.cookies.set).not.toHaveBeenCalled();
  });

  it.each(["admin", "expert"] as const)("rejects inactive and deleted %s sessions and cookie minting", async role => {
    const table = role === "admin" ? "admin_accounts" : "expert_accounts";
    const id = randomUUID(); privileged.push({ table, id });
    const email = `${id}@roles.test`;
    await query(role === "admin"
      ? "INSERT INTO admin_accounts(id,email,name,password_hash) VALUES($1,$2,'Role fixture','hash')"
      : "INSERT INTO expert_accounts(id,email,name,password_hash,slug) VALUES($1,$2,'Role fixture','hash',$3)", role === "admin" ? [id, email] : [id, email, id]);
    const payload = { sub: id, role, email, name: "Role fixture" };
    cookie.token = await signToken(payload);
    expect((await getAuth())?.sub).toBe(id);
    await query(`UPDATE ${table} SET is_active=FALSE WHERE id=$1`, [id]);
    expect(await getAuth()).toBeNull();
    expect(await setAuthCookie(payload)).toBe(false);
    if (role === "expert") expect(await findExpertByEmail(email)).toBeNull();
    await query(`DELETE FROM ${table} WHERE id=$1`, [id]);
    expect(await getAuth()).toBeNull();
  });

  it("requires a guest claim without profile and gives a simultaneous orphan claim to only one owner", async () => {
    const a = await account(), b = await account();
    const owned = (await query("INSERT INTO sessions(user_id) VALUES($1) RETURNING id", [a.pid])).rows[0].id;
    expect((await resolveSessionForUser(owned, null, { sessionClaim: null })).error?.status).toBe(401);
    const orphan = (await query("INSERT INTO sessions DEFAULT VALUES RETURNING id")).rows[0].id;
    expect((await resolveSessionForUser(orphan, null, { sessionClaim: null })).error?.status).toBe(403);
    const claim = await signSessionClaim(orphan);
    expect((await resolveSessionForUser(orphan, null, { sessionClaim: claim })).session?.user_id).toBeNull();
    const results = await Promise.all([a.pid, b.pid].map(pid => resolveSessionForUser(orphan, pid, { sessionClaim: claim })));
    expect(results.filter(result => !result.error)).toHaveLength(1);
    const owner = (await getSession(orphan))!.user_id;
    expect(results.find(result => !result.error)!.session?.user_id).toBe(owner);
    expect(results.find(result => result.error)!.error?.status).toBe(403);
  });

  it("blocks session PATCH and payment creation when an authenticated account lacks a profile", async () => {
    const owner = await account(), stub = await account(false);
    const sessionId = (await query("INSERT INTO sessions(user_id) VALUES($1) RETURNING id", [owner.pid])).rows[0].id;
    await login(stub.aid);
    const patch = await sessionPatch(new NextRequest("https://zovus.ru/api/session", { method: "PATCH", body: JSON.stringify({ sessionId, awaitingContext: true }) }));
    expect(patch.status).toBe(403);
    const payment = await paymentCreate(new NextRequest("https://zovus.ru/api/payment/create", { method: "POST", body: JSON.stringify({ sessionId, plan: "single" }) }));
    expect(payment.status).toBe(403);
    expect((await query("SELECT awaiting_context FROM sessions WHERE id=$1", [sessionId])).rows[0].awaiting_context).toBe(false);
    expect((await query("SELECT id FROM payments WHERE session_id=$1", [sessionId])).rowCount).toBe(0);
  });

  it("hides accepted-erasure sessions and fences metadata writes with unchanged owner", async () => {
    const { aid, pid } = await account();
    const sid = (await query("INSERT INTO sessions(user_id) VALUES($1) RETURNING id", [pid])).rows[0].id;
    const token = await resetToken(aid);
    await requestAccountErasure(aid);
    expect(await getSession(sid)).toBeNull();
    await expect(query("UPDATE sessions SET awaiting_context=TRUE WHERE id=$1", [sid])).rejects.toThrow("account_erasure_pending");
    await expect(completePasswordReset(token, "new-password")).resolves.toMatchObject({ ok: false });
  });

  it("disables owned ordinary and private shares immediately on accepted erasure", async () => {
    const { aid, pid } = await account();
    const share = await createShareSnapshot({ kind: "reading", title: "Fixture", excerpt: "Owned fixture text" }, pid);
    expect(await getShareSnapshotByToken(share!.token, true)).not.toBeNull();
    const rid = (await query("INSERT INTO natal_report_history(user_id,birth_fingerprint,engine_version,ephemeris,tradition,content) VALUES($1,'fixture','fixture','fixture','western','Owned fixture') RETURNING id", [pid])).rows[0].id;
    const token = randomBytes(32).toString("base64url");
    await query("INSERT INTO private_report_shares(owner_user_id,token,report_kind,report_id,selected_sections,public_payload,expires_at) VALUES($1,$2,'natal',$3,ARRAY['summary'],'{}',NOW()+INTERVAL '1 day')", [pid, token, rid]);
    expect(await getActivePublicReportShare(token)).not.toBeNull();
    await requestAccountErasure(aid);
    expect(await getActivePublicReportShare(token)).toBeNull();
    expect(await getShareSnapshotByToken(share!.token, true)).toBeNull();
    expect(await createShareSnapshot({ kind: "reading", title: "Revoked", excerpt: "Must not persist" }, pid)).toBeNull();
    expect((await query("SELECT view_count FROM share_snapshots WHERE token=$1", [share!.token])).rows[0].view_count).toBe(1);
  });

  it("keeps true anonymous legacy shares readable", async () => {
    const token = randomUUID();
    await query("INSERT INTO share_snapshots(token,kind,payload) VALUES($1,'reading',$2::jsonb)", [token, JSON.stringify({ kind: "reading", title: "Guest legacy", excerpt: "Guest fixture" })]);
    expect((await getShareSnapshotByToken(token))?.payload.title).toBe("Guest legacy");
    await query("DELETE FROM share_snapshots WHERE token=$1", [token]);
  });

  it("does not grant invite viewers private partner or combined results", async () => {
    const a = await account(), unrelated = await account();
    const token = randomUUID();
    await query("INSERT INTO joint_readings(token,initiator_user_id,spread_id,intent_slug,expires_at,initiator_reading) VALUES($1,$2,'love-7','sovmestimost-pary',NOW()+INTERVAL '1 day','Private A')", [token, a.pid]);
    await login(unrelated.aid);
    const response = await jointGet(new NextRequest(`https://zovus.ru/api/joint-reading/${token}`), { params: Promise.resolve({ token }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ viewerRole: "guest", canStartAsPartner: true, partnerReading: null, combinedReading: null, initiatorReading: null });
    await query("UPDATE joint_readings SET partner_reading='Erased private B',combined_reading='Erased combined' WHERE token=$1", [token]);
    expect(await getJointReadingByToken(token)).toBeNull();
    expect((await jointGet(new NextRequest(`https://zovus.ru/api/joint-reading/${token}`), { params: Promise.resolve({ token }) })).status).toBe(404);
  });

  it("hides joint reports immediately for either erased participant and deletes them on partner wipe", async () => {
    const a = await account(), b = await account();
    const token = randomUUID();
    await query("INSERT INTO joint_readings(token,initiator_user_id,partner_user_id,spread_id,intent_slug,expires_at,status,initiator_reading,partner_reading,combined_reading) VALUES($1,$2,$3,'love-7','sovmestimost-pary',NOW()+INTERVAL '1 day','completed','A','B','AB')", [token, a.pid, b.pid]);
    expect(await getJointReadingByToken(token)).not.toBeNull();
    await requestAccountErasure(b.aid);
    expect(await getJointReadingByToken(token)).toBeNull();
    expect(await listJointReadingsForUser(a.pid)).toEqual([]);
    await deleteUserAccountCompletely(b.aid, b.pid);
    expect((await query("SELECT id FROM joint_readings WHERE token=$1", [token])).rowCount).toBe(0);
  });

  it("deletes a claimed Palm snapshot without violating its claim-state CHECK", async () => {
    const { aid, pid } = await account();
    await query("INSERT INTO palm_guest_snapshots(snapshot,engine_version,claim_token_hash,claimed_user_id,claimed_at,expires_at) VALUES('{}','fixture',$1,$2,NOW(),NOW()+INTERVAL '1 day')", [randomUUID(), pid]);
    const result = await deleteUserAccountCompletely(aid, pid);
    expect(result.userRemoved).toBe(1);
    expect((await query("SELECT id FROM palm_guest_snapshots WHERE claimed_user_id=$1", [pid])).rowCount).toBe(0);
  });

  it.each([true, false])("purges email PII and rejects delayed logs after erasure (profile=%s)", async withProfile => {
    const { aid } = await account(withProfile);
    const addresses = [`${aid}@privacy.test`, `${aid}@contact.privacy.test`, `${aid}@oauth.privacy.test`];
    await query("UPDATE user_accounts SET contact_email=$2 WHERE id=$1", [aid, addresses[1]]);
    await query("INSERT INTO user_oauth_identities(user_account_id,provider,provider_user_id,provider_email) VALUES($1,'yandex',$2,$3)", [aid, aid, addresses[2]]);
    const write = () => Promise.all(addresses.map(address => logEmailAttempt({ recipient: ` ${address.toUpperCase()} `, subject: "Private fixture subject", template: "privacy_fixture", provider: "fixture", status: "sent", meta: { privateContent: "Fixture" } })));
    await write();
    expect((await query("SELECT id FROM email_log WHERE template='privacy_fixture'")).rowCount).toBe(3);
    await requestAccountErasure(aid);
    await write();
    expect((await query("SELECT id FROM email_log WHERE template='privacy_fixture'")).rowCount).toBe(3);
    expect(await processDueAccountErasures(1)).toEqual({ completed: 1, failed: 0 });
    expect((await query("SELECT id FROM user_accounts WHERE id=$1", [aid])).rowCount).toBe(0);
    expect((await query("SELECT id FROM email_log WHERE template='privacy_fixture'")).rowCount).toBe(0);
    await write();
    expect((await query("SELECT id FROM email_log WHERE template='privacy_fixture'")).rowCount).toBe(0);
    const tombstone = (await query("SELECT email_hashes,stage FROM account_erasure_jobs WHERE account_id=$1", [aid])).rows[0];
    expect(tombstone.stage).toBe("completed");
    expect(tombstone.email_hashes.sort()).toEqual(addresses.map(address => createHash("sha256").update(address).digest("hex")).sort());
  });

  it("serializes an in-flight email log before erasure acceptance and purges it", async () => {
    const { aid } = await account();
    const writer = await getPool().connect();
    let erasure: ReturnType<typeof requestAccountErasure> | undefined;
    try {
      await writer.query("BEGIN");
      await writer.query("INSERT INTO email_log(recipient,subject,template,status) VALUES($1,'Fixture','privacy_fixture','sent')", [`${aid}@privacy.test`]);
      let accepted = false;
      erasure = requestAccountErasure(aid).then(result => { accepted = true; return result; });
      let waiting = false;
      for (let i = 0; i < 150; i++) {
        const rows = await getPool().query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id, profile_user_id FROM user_accounts%' ");
        if (rows.rowCount) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      expect(accepted).toBe(false);
      await writer.query("COMMIT");
      expect((await erasure).pending).toBe(true);
      expect(await processDueAccountErasures(1)).toEqual({ completed: 1, failed: 0 });
      expect((await query("SELECT id FROM email_log WHERE template='privacy_fixture'")).rowCount).toBe(0);
    } finally {
      await writer.query("ROLLBACK"); writer.release();
      if (erasure) await erasure;
    }
  });

  it("retains an email fingerprint for synchronous internal erasure without recreating PII", async () => {
    const { aid, pid } = await account();
    const params = { recipient: `${aid}@privacy.test`, subject: "Fixture", template: "privacy_fixture", provider: "fixture", status: "sent" as const };
    await logEmailAttempt(params);
    await deleteUserAccountCompletely(aid, pid);
    expect((await query("SELECT id FROM email_log WHERE template='privacy_fixture'")).rowCount).toBe(0);
    await logEmailAttempt(params);
    expect((await query("SELECT id FROM email_log WHERE template='privacy_fixture'")).rowCount).toBe(0);
    expect((await query("SELECT stage FROM account_erasure_jobs WHERE account_id=$1", [aid])).rows[0].stage).toBe("completed");
  });

  it("commits a public intake atomically, preserving birth time and consent", async () => {
    const f = await proFixture();
    const result = await submitIntake(f.token, { alias: " Client ", birthDate: "1990-01-01", birthTime: "12:30", consentPdn: true, caseType: "hd" });
    expect((await proQuery("SELECT alias,birth_time,consent_state FROM pro.clients WHERE id=$1", [result.clientId])).rows[0]).toMatchObject({ alias: "Client", birth_time: "12:30:00", consent_state: "confirmed" });
    expect((await proQuery("SELECT status FROM pro.cases WHERE id=$1", [result.caseId])).rows[0].status).toBe("input_ready");
    expect((await proQuery("SELECT id FROM pro.intake_responses WHERE case_id=$1", [result.caseId])).rowCount).toBe(1);
    expect((await proQuery("SELECT id FROM pro.client_consents WHERE client_id=$1 AND granted=TRUE", [result.clientId])).rowCount).toBe(1);
  });

  it("rolls back all intake writes when a later case limit fails", async () => {
    const f = await proFixture();
    vi.stubEnv("PRO_MAX_CASES_PER_DAY", "0");
    await expect(submitIntake(f.token, { alias: "Must not remain", consentPdn: true })).rejects.toThrow("pro_case_daily_limit");
    expect((await proQuery("SELECT id FROM pro.clients WHERE account_id=$1", [f.id])).rowCount).toBe(0);
    expect((await proQuery("SELECT id FROM pro.intake_responses WHERE account_id=$1", [f.id])).rowCount).toBe(0);
  });

  it("rolls back the client, consent, case and input when final intake persistence fails", async () => {
    const f = await proFixture();
    await getProPool().query(`CREATE FUNCTION pro.identity_fixture_reject_intake() RETURNS trigger AS $$
      BEGIN IF NEW.answers->>'alias' = 'Injected rollback fixture' THEN RAISE EXCEPTION 'fixture_late_failure'; END IF; RETURN NEW; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER identity_fixture_reject_intake BEFORE INSERT ON pro.intake_responses
      FOR EACH ROW EXECUTE FUNCTION pro.identity_fixture_reject_intake()`);
    try {
      await expect(submitIntake(f.token, { alias: "Injected rollback fixture", consentPdn: true })).rejects.toThrow("fixture_late_failure");
      expect((await proQuery("SELECT id FROM pro.clients WHERE account_id=$1", [f.id])).rowCount).toBe(0);
      expect((await proQuery("SELECT id FROM pro.cases WHERE account_id=$1", [f.id])).rowCount).toBe(0);
      expect((await proQuery("SELECT id FROM pro.intake_responses WHERE account_id=$1", [f.id])).rowCount).toBe(0);
      expect((await proQuery("SELECT client_id FROM pro.client_consents")).rowCount).toBe(0);
      expect((await proQuery("SELECT case_id FROM pro.case_inputs")).rowCount).toBe(0);
    } finally {
      await getProPool().query("DROP TRIGGER identity_fixture_reject_intake ON pro.intake_responses; DROP FUNCTION pro.identity_fixture_reject_intake()");
    }
  });

  it("serializes a paused Pro intake commit before erasure acceptance", async () => {
    const f = await proFixture();
    const blocker = await getProPool().connect();
    let intake: ReturnType<typeof submitIntake> | undefined;
    let erasure: ReturnType<typeof requestAccountErasure> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM pro.intake_forms WHERE id=$1 FOR UPDATE", [f.formId]);
      intake = submitIntake(f.token, { alias: "Before accepted erasure", consentPdn: true });
      let waiting = false;
      for (let i = 0; i < 150; i++) {
        const rows = await getPool().query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE OF a, f%'");
        if (rows.rowCount) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      erasure = requestAccountErasure(f.aid);
      let erased = false; erasure.then(() => { erased = true; });
      // Probe the lock deterministically from another physical connection.
      const probe = await getPool().connect();
      try {
        await probe.query("BEGIN");
        await expect(probe.query("SELECT id FROM users WHERE id=$1 FOR UPDATE NOWAIT", [f.pid])).rejects.toMatchObject({ code: "55P03" });
      } finally { await probe.query("ROLLBACK"); probe.release(); }
      expect(erased).toBe(false);
      await blocker.query("COMMIT");
      expect((await intake).accountId).toBe(f.id);
      expect((await erasure).pending).toBe(true);
      await expect(submitIntake(f.token, { alias: "After accepted erasure", consentPdn: true })).rejects.toThrow("intake_not_found");
      expect((await proQuery("SELECT id FROM pro.clients WHERE account_id=$1", [f.id])).rowCount).toBe(1);
    } finally {
      await blocker.query("ROLLBACK"); blocker.release();
      await Promise.allSettled([intake, erasure].filter(Boolean));
    }
  });

  it("rejects erased/suspended/deleted Pro capability reads and writes", async () => {
    const f = await proFixture();
    expect(await getIntakeFormPublicMeta(f.token)).not.toBeNull();
    expect(await getPublishedLandingBySlug(f.slug)).not.toBeNull();
    await proQuery("UPDATE pro.intake_forms SET active=FALSE WHERE id=$1", [f.formId]);
    expect(await getPublishedLandingBySlug(f.slug)).toBeNull();
    expect(await getIntakeFormPublicMeta(f.token)).toBeNull();
    await proQuery("UPDATE pro.intake_forms SET active=TRUE WHERE id=$1", [f.formId]);
    await proQuery("UPDATE pro.accounts SET status='suspended' WHERE id=$1", [f.id]);
    expect(await getIntakeFormPublicMeta(f.token)).toBeNull();
    await expect(submitIntake(f.token, { alias: "Blocked", consentPdn: true })).rejects.toThrow("intake_not_found");
    await proQuery("UPDATE pro.accounts SET status='active' WHERE id=$1", [f.id]);
    await proQuery("UPDATE pro.accounts SET deleted_at=NOW() WHERE id=$1", [f.id]);
    expect(await getIntakeFormPublicMeta(f.token)).toBeNull();
    await expect(submitIntake(f.token, { alias: "Blocked", consentPdn: true })).rejects.toThrow("intake_not_found");
    await proQuery("UPDATE pro.accounts SET deleted_at=NULL WHERE id=$1", [f.id]);
    await requestAccountErasure(f.aid);
    expect(await getIntakeFormPublicMeta(f.token)).toBeNull();
    expect(await getPublishedLandingBySlug(f.slug)).toBeNull();
    await expect(submitIntake(f.token, { alias: "Blocked", consentPdn: true })).rejects.toThrow("intake_not_found");
    expect((await proQuery("SELECT id FROM pro.clients WHERE account_id=$1", [f.id])).rowCount).toBe(0);
  });

  it("serves a signed public unsubscribe through middleware and rejects tampering", async () => {
    const { aid } = await account();
    const token = await signReminderUnsubscribeToken(aid, "daily_cards");
    const request = new NextRequest(`https://zovus.ru/api/notifications/unsubscribe?token=${token}`);
    expect((await middleware(request)).headers.get("x-middleware-next")).toBe("1");
    expect((await unsubscribe(request)).status).toBe(200);
    expect((await query("SELECT daily_cards_reminder FROM user_accounts WHERE id=$1", [aid])).rows[0].daily_cards_reminder).toBe(false);
    expect((await unsubscribe(new NextRequest("https://zovus.ru/api/notifications/unsubscribe?token=tampered"))).status).toBe(400);
  });
});
