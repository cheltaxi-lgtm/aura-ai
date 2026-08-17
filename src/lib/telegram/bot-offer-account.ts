import { normalizeAuthEmail } from "@/lib/auth";
import { findUserById, getProfileUserIdForAccount, saveRegistrationAttributionIfEmpty } from "@/lib/accounts";
import { query, queryClient, withTransaction } from "@/lib/db";
import { normalizeStoredDisplayName } from "@/lib/normalize-person-name";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";
import {
  normalizeUserGender,
  resolveClientGender,
  type BinaryGender,
} from "@/lib/russian-name-gender";
import { buildAstroMeta, type LifeFocus } from "@/lib/astro-profile";
import { createUserProfileForAccount, getUserById, updateUserProfile } from "@/lib/users";
import { getZodiacFromDate } from "@/utils/zodiac";
import { findTelegramIdentity } from "@/lib/telegram/accounts";
import { resolveBotUser, type BotResolveResult } from "@/lib/telegram/bot-resolve";
import { recordInitialMemoryChoice } from "@/lib/memory/preferences";

function syntheticBotEmail(telegramUserId: number): string {
  return normalizeAuthEmail(`tg_${telegramUserId}@telegram.zovus.local`);
}

export type BotOfferEnsureInput = {
  telegramUserId: number;
  firstName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  /** ISO timestamps from bot gates (required for new accounts). */
  termsAcceptedAt: string;
  ageConfirmedAt: string;
  marketingConsent?: boolean;
  attribution?: Record<string, string> | null;
};

/**
 * Create or return a Zovus account bound to Telegram after bot offer consent.
 * Not Telegram Login: account is created under Zovus offer; TG is the channel bind.
 */
export async function ensureBotOfferAccount(
  input: BotOfferEnsureInput
): Promise<BotResolveResult & { created: boolean }> {
  const telegramUserId = input.telegramUserId;
  const existing = await findTelegramIdentity(telegramUserId);
  if (existing) {
    const resolved = await resolveBotUser(telegramUserId);
    return { ...resolved, created: false };
  }

  const termsAt = Date.parse(input.termsAcceptedAt);
  const ageAt = Date.parse(input.ageConfirmedAt);
  if (!Number.isFinite(termsAt) || !Number.isFinite(ageAt)) {
    throw new Error("CONSENT_TIMESTAMPS_REQUIRED");
  }

  const displayName = normalizeStoredDisplayName(input.firstName || "", "Гость");
  const email = syntheticBotEmail(telegramUserId);
  const marketing = true;
  const marketingAt = new Date(termsAt).toISOString();
  const attribution = {
    utm_source: "telegram",
    utm_medium: "bot",
    utm_campaign: "bot_offer",
    ...(input.attribution || {}),
  };

  await withTransaction(async (client) => {
    await queryClient(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [
      `telegram:${telegramUserId}`,
    ]);

    const again = await queryClient<{ user_account_id: string }>(
      client,
      `SELECT user_account_id FROM user_telegram_identities WHERE telegram_user_id = $1 FOR UPDATE`,
      [telegramUserId]
    );
    if (again.rows[0]) return;

    const accountResult = await queryClient<{ id: string }>(
      client,
      `INSERT INTO user_accounts (
         email, password_hash, name,
         terms_accepted_at, age_confirmed_at, marketing_consent, marketing_consent_at,
         registration_attribution
       )
       VALUES ($1, NULL, $2, $3::timestamptz, $4::timestamptz, $5, $6::timestamptz, $7::jsonb)
       RETURNING id`,
      [
        email,
        displayName,
        new Date(termsAt).toISOString(),
        new Date(ageAt).toISOString(),
        marketing,
        marketingAt,
        JSON.stringify(attribution),
      ]
    );
    const accountId = accountResult.rows[0]?.id;
    if (!accountId) throw new Error("BOT_OFFER_ACCOUNT_CREATE_FAILED");

    await queryClient(
      client,
      `INSERT INTO user_telegram_identities (
         user_account_id, telegram_user_id, username, photo_url, first_name, last_login_at
       ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        accountId,
        telegramUserId,
        input.username ?? null,
        input.photoUrl ?? null,
        input.firstName ?? null,
      ]
    );
  });

  const resolved = await resolveBotUser(telegramUserId);
  if (resolved.accountId) {
    await saveRegistrationAttributionIfEmpty(resolved.accountId, attribution).catch(() => undefined);
  }
  console.info("[auth] bot_offer_account", {
    telegramUserId,
    accountId: resolved.accountId,
    created: true,
  });
  return { ...resolved, created: true };
}

export type BotOfferProfileInput = {
  telegramUserId: number;
  name?: string | null;
  birthDate: string;
  gender: BinaryGender;
  birthCity?: string | null;
  /** First personal-memory choice from bot registration. */
  memoryChoice?: "enabled" | "disabled" | null;
};

/** Complete product profile (birth date) for a bot-offer account. */
export async function upsertBotOfferProfile(
  input: BotOfferProfileInput
): Promise<BotResolveResult> {
  const identity = await findTelegramIdentity(input.telegramUserId);
  if (!identity) {
    throw new Error("NOT_LINKED");
  }

  const birthDate = input.birthDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new Error("INVALID_BIRTH_DATE");
  }
  const birth = new Date(`${birthDate}T12:00:00Z`);
  if (Number.isNaN(birth.getTime())) throw new Error("INVALID_BIRTH_DATE");
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  if (age < 18 || age > 120) throw new Error("AGE_GATE");

  const birthCity =
    typeof input.birthCity === "string" && input.birthCity.trim()
      ? input.birthCity.trim().slice(0, 160)
      : null;

  const account = await findUserById(identity.user_account_id);
  const name = normalizeStoredDisplayName(
    input.name || account?.name || "",
    "Гость"
  );
  const gender =
    resolveClientGender(input.gender, name) || input.gender;
  const zodiac = getZodiacFromDate(birthDate).name;
  const astroMeta = buildAstroMeta(birthDate) || undefined;

  let profileUserId = await getProfileUserIdForAccount(identity.user_account_id);
  if (!profileUserId) {
    const created = await createUserProfileForAccount(identity.user_account_id, {
      name,
      gender,
      birthDate,
      zodiac,
      birthCity: birthCity ?? undefined,
      astroMeta,
    });
    profileUserId = created.id;
    await grantStarterRunesIfNeeded(profileUserId);
  } else {
    const current = await getUserById(profileUserId);
    if (!current?.birth_date) {
      await updateUserProfile(profileUserId, {
        name,
        gender,
        birthDate,
        zodiac,
        birthTime: current?.birth_time ?? undefined,
        birthCity: birthCity ?? current?.birth_city ?? undefined,
        lifeFocus: (current?.life_focus as LifeFocus) || "general",
        mainQuestion: current?.main_question ?? undefined,
        astroMeta,
      });
      await grantStarterRunesIfNeeded(profileUserId);
    } else {
      const currentGender = normalizeUserGender(current.gender) as BinaryGender | null;
      const nextGender = (gender || currentGender) as BinaryGender;
      const nextCity = birthCity ?? current.birth_city ?? undefined;
      const nameChanged = Boolean(name && name !== current.name);
      const cityChanged = Boolean(birthCity && birthCity !== (current.birth_city ?? ""));
      const genderChanged = Boolean(gender && gender !== currentGender);

      if (nameChanged) {
        await query(`UPDATE user_accounts SET name = $2 WHERE id = $1`, [
          identity.user_account_id,
          name,
        ]);
      }
      if (nameChanged || cityChanged || genderChanged) {
        await updateUserProfile(profileUserId, {
          name: nameChanged ? name : current.name,
          gender: nextGender,
          birthDate: current.birth_date,
          zodiac: current.zodiac,
          birthTime: current.birth_time ?? undefined,
          birthCity: nextCity,
          lifeFocus: (current.life_focus as LifeFocus) || "general",
          mainQuestion: current.main_question ?? undefined,
        });
      }
    }
  }

  if (
    profileUserId &&
    (input.memoryChoice === "enabled" || input.memoryChoice === "disabled")
  ) {
    try {
      await recordInitialMemoryChoice(profileUserId, input.memoryChoice);
    } catch (err) {
      console.warn("[bot/profile] memory choice", err);
    }
  }

  return resolveBotUser(input.telegramUserId);
}
