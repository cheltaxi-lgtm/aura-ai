/**
 * Slot release compensation tests. Run via: npm test
 */
import { migrate } from "../client.js";
import { ensureCriticalColumns, migrateUp } from "../migrate-runner.js";
import {
  canDrawTriplet,
  claimSpreadSlot,
  confirmAge,
  confirmConsent,
  countTripletsToday,
  createGuestSession,
  deleteUserData,
  findSessionById,
  getUser,
  hasSpreadClaim,
  markTeaserDelivered,
  releaseFailedSpreadSlot,
  SPREAD_SLOT_RELEASE_WINDOW_MS,
  upsertUser,
} from "../repos.js";
import { createSessionToken, hashSessionToken } from "../../domain/session/token.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function seedUser(uid: number) {
  upsertUser({ telegramUserId: uid, chatId: uid, firstName: "T" });
  confirmAge(uid);
  confirmConsent(uid);
  return getUser(uid)!;
}

function makeSession(uid: number, sid: string, question: string) {
  const tok = createSessionToken();
  createGuestSession({
    id: sid,
    telegramUserId: uid,
    question,
    cards: [
      { id: 1, name: "A", reversed: false, position: 0 },
      { id: 2, name: "B", reversed: false, position: 1 },
      { id: 3, name: "C", reversed: false, position: 2 },
    ],
    teaserText: "тизер",
    teaserPromptVersion: "a",
    teaserModel: "a",
    teaserSeed: "a",
    tokenHash: hashSessionToken(tok),
    plainToken: tok,
    fingerprint: `fp-${sid}`,
    questionSource: "chip",
  });
}

function main(): void {
  migrate();
  migrateUp();
  ensureCriticalColumns();

  // (a) failure before teaser delivery → slot returned, retry possible
  {
    const uid = 910_001;
    deleteUserData(uid);
    const user = seedUser(uid);
    const q = "Вопрос слот а один длинный";
    const sid = "slot-a-1";
    assert(claimSpreadSlot(uid, q, sid, user).claimed, "a: claim");
    makeSession(uid, sid, q);
    assert(hasSpreadClaim(uid, q, user), "a: claim present");
    const r = releaseFailedSpreadSlot({
      telegramUserId: uid,
      question: q,
      sessionId: sid,
      user,
    });
    assert(r.released, `a: released (${r.reason})`);
    assert(findSessionById(sid)?.status === "failed", "a: session failed");
    assert(!hasSpreadClaim(uid, q, user), "a: claim gone");
    assert(countTripletsToday(uid, user) === 0, "a: failed not counted");
    assert(canDrawTriplet(getUser(uid)!), "a: can draw again");
    const sid2 = "slot-a-2";
    assert(claimSpreadSlot(uid, q, sid2, user).claimed, "a: retry claim");
    deleteUserData(uid);
  }

  // (b) failure after delivery → slot NOT returned
  {
    const uid = 910_002;
    deleteUserData(uid);
    const user = seedUser(uid);
    const q = "Вопрос слот б два длинный";
    const sid = "slot-b-1";
    assert(claimSpreadSlot(uid, q, sid, user).claimed, "b: claim");
    makeSession(uid, sid, q);
    markTeaserDelivered(sid);
    const r = releaseFailedSpreadSlot({
      telegramUserId: uid,
      question: q,
      sessionId: sid,
      user,
    });
    assert(!r.released && r.reason === "teaser_delivered", `b: no release (${r.reason})`);
    assert(hasSpreadClaim(uid, q, user), "b: claim kept");
    assert(!claimSpreadSlot(uid, q, "slot-b-2", user).claimed, "b: no second claim");
    assert(findSessionById(sid)?.status === "ok", "b: still ok");
    deleteUserData(uid);
  }

  // (c) retry 20 minutes after failure → outside window, no release
  {
    const uid = 910_003;
    deleteUserData(uid);
    const user = seedUser(uid);
    const q = "Вопрос слот в три длинный";
    const sid = "slot-c-1";
    assert(claimSpreadSlot(uid, q, sid, user).claimed, "c: claim");
    makeSession(uid, sid, q);
    const late = Date.now() + SPREAD_SLOT_RELEASE_WINDOW_MS + 5 * 60 * 1000;
    const r = releaseFailedSpreadSlot({
      telegramUserId: uid,
      question: q,
      sessionId: sid,
      user,
      nowMs: late,
    });
    assert(!r.released && r.reason === "window_elapsed", `c: window (${r.reason})`);
    assert(hasSpreadClaim(uid, q, user), "c: claim kept after 20m");
    assert(!claimSpreadSlot(uid, q, "slot-c-2", user).claimed, "c: retry blocked");
    deleteUserData(uid);
  }

  console.log("ok: slot-release a/b/c");
}

main();
