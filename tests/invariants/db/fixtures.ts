/**
 * Fixtures for invariant DB tests.
 * Prefer product helpers; SQL only when no product API exists.
 */
import {
  createGuestResumeToken,
  hashGuestResumeToken,
  validateGuestCompleteInput,
  type GuestResumeSymbol,
} from "@/lib/guest-triplet-receipt";
import { createIssuedGuestResumeSession } from "@/lib/guest-triplet-receipt-db";
import { GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";
import { addRunes } from "@/lib/rune-service";
import { createUserProfile } from "@/lib/users";
import { query } from "@/lib/db";

export const SAMPLE_SYMBOLS: GuestResumeSymbol[] = [
  { id: 0, name: "Шут", position: 0, reversed: false },
  { id: 1, name: "Маг", position: 1, reversed: true },
  { id: 2, name: "Жрица", position: 2, reversed: false },
];

export async function createTestUser(opts?: {
  name?: string;
  runeBalance?: number;
}) {
  const user = await createUserProfile({
    name: opts?.name ?? "Invariant Test",
    gender: "female",
    birthDate: "1990-01-15",
    zodiac: "Козерог",
    birthCity: "Москва",
  });

  const balance = opts?.runeBalance ?? 0;
  if (balance > 0) {
    // Product helper — grants via ledger.
    await addRunes(user.id, balance, "bonus", "invariant fixture grant");
  } else if (balance === 0) {
    // createUserProfile leaves default 0 — OK.
  }

  return user;
}

/** Issue a guest receipt the same way /api/guest-triplet/complete does (minus cookies). */
export async function issueGuestReceipt(opts?: {
  symbols?: GuestResumeSymbol[];
  question?: string;
}) {
  const symbols = opts?.symbols ?? SAMPLE_SYMBOLS;
  const validated = validateGuestCompleteInput({
    masterId: GUEST_TRIPLET_MASTER_ID,
    system: "tarot-veronika",
    spreadId: "triplet",
    question: opts?.question ?? "Что меня ждёт в отношениях?",
    cards: symbols.map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      reversed: s.reversed,
    })),
  });
  if (!validated.ok) {
    throw new Error(`fixture validate failed: ${validated.error}`);
  }

  const token = createGuestResumeToken();
  const tokenHash = hashGuestResumeToken(token);
  const session = await createIssuedGuestResumeSession({
    masterId: validated.masterId,
    system: validated.system,
    spreadId: validated.spreadId,
    question: validated.question,
    symbols: validated.symbols,
    fingerprint: validated.fingerprint,
    tokenHash,
  });

  return {
    token,
    tokenHash,
    session,
    symbols: validated.symbols,
    fingerprint: validated.fingerprint,
  };
}

/** Direct SQL: read raw session row for hash/token leakage checks. */
export async function fetchSessionRowRaw(sessionId: string) {
  // No product helper returns every column as a flat JSON bag.
  const { rows } = await query<Record<string, unknown>>(
    `SELECT * FROM sessions WHERE id = $1`,
    [sessionId]
  );
  return rows[0] ?? null;
}

export async function countSpendTransactions(userId: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM rune_transactions
     WHERE user_id = $1 AND type = 'spend' AND amount < 0`,
    [userId]
  );
  return Number(rows[0]?.n ?? 0);
}

export async function getUserBalance(userId: string): Promise<number> {
  const { rows } = await query<{ rune_balance: number }>(
    `SELECT rune_balance FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0]?.rune_balance ?? 0;
}
