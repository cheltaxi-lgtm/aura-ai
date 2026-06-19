import { NextRequest, NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";
import { getProfileUserIdForAccount, linkAccountToProfile } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import {
  createUserProfile,
  createHistoryEntry,
  getUserById,
  serializeUserProfile,
  updateUserProfile,
  getLatestHistoryEntry,
} from "@/lib/users";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";
import { buildAstroMeta } from "@/lib/astro-profile";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { tarotCardsKey } from "@/lib/tarot";

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: NextRequest) {
  let step = "init";
  try {
    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json({ error: "Требуется регистрация" }, { status: 401 });
    }

    const {
      name,
      gender,
      birthDate,
      zodiac,
      birthTime,
      birthCity,
      lifeFocus,
      mainQuestion,
      sessionId: _sessionId,
      tarotCards,
      teaser,
    } = await request.json();
    void _sessionId;

    if (!name || !gender || !birthDate || !zodiac) {
      const missing = [
        !name && "name",
        !gender && "gender",
        !birthDate && "birthDate",
        !zodiac && "zodiac",
      ].filter(Boolean);
      console.error("Onboarding 400 missing fields:", missing);
      return NextResponse.json(
        { error: "Заполните профиль", code: "MISSING_PROFILE", missing },
        { status: 400 }
      );
    }

    if (!tarotCards?.length) {
      return NextResponse.json({ error: "Сначала выберите карты" }, { status: 400 });
    }

    const birthMs = Date.parse(String(birthDate));
    const now = Date.now();
    if (Number.isNaN(birthMs) || birthMs > now) {
      return NextResponse.json({ error: "Некорректная дата рождения" }, { status: 400 });
    }
    const minBirth = new Date();
    minBirth.setFullYear(minBirth.getFullYear() - 120);
    if (birthMs < minBirth.getTime()) {
      return NextResponse.json({ error: "Некорректная дата рождения" }, { status: 400 });
    }

    const normalizedBirthTime = normalizeOptionalText(birthTime);
    const normalizedBirthCity = normalizeOptionalText(birthCity);

    step = "astro_meta";
    const astroMeta = buildAstroMeta(birthDate) ?? undefined;
    let profileUserId = await getProfileUserIdForAccount(auth.sub);
    if (profileUserId) {
      const linkedUser = await getUserById(profileUserId);
      if (!linkedUser) {
        await query("UPDATE user_accounts SET profile_user_id = NULL WHERE id = $1", [auth.sub]);
        profileUserId = null;
      }
    }
    let user = profileUserId ? await getUserById(profileUserId) : null;

    if (!user) {
      step = "create_user";
      user = await createUserProfile({
        name,
        gender,
        birthDate,
        zodiac,
        birthTime: normalizedBirthTime,
        birthCity: normalizedBirthCity,
        lifeFocus,
        mainQuestion,
        astroMeta,
      });
      step = "link_account";
      await linkAccountToProfile(auth.sub, user.id);
      profileUserId = user.id;
      step = "starter_runes";
      try {
        await grantStarterRunesIfNeeded(user.id);
      } catch (starterErr) {
        console.error("Starter runes skipped:", starterErr);
      }
    } else {
      step = "update_user";
      const updated = await updateUserProfile(user.id, {
        name,
        gender,
        birthDate,
        zodiac,
        birthTime: normalizedBirthTime,
        birthCity: normalizedBirthCity,
        lifeFocus,
        mainQuestion,
        astroMeta,
      });
      if (updated) user = updated;
    }

    const verifiedUser = await getUserById(user.id);
    if (!verifiedUser) {
      throw new Error(`Profile user ${user.id} not found after save`);
    }
    user = verifiedUser;

    step = "cooldown_check";
    const cooldown = await checkTripletCooldown(user.id);
    if (!cooldown.allowed) {
      return NextResponse.json(
        {
          error: "TRIPLET_COOLDOWN",
          message: "Новый расклад из 3 карт доступен один раз в сутки",
          nextAvailableAt: cooldown.nextAvailableAt,
        },
        { status: 429 }
      );
    }

    const cardsKey = tarotCardsKey(tarotCards ?? []);
    const latestTriplet = await getLatestHistoryEntry(user.id, { characterName: "triplet" });
    if (latestTriplet && cardsKey) {
      const existingKey = tarotCardsKey(
        latestTriplet.context_data?.tarotCards as { name: string }[] | undefined
      );
      const ageMs = Date.now() - new Date(latestTriplet.created_at).getTime();
      if (existingKey === cardsKey && ageMs < 60_000) {
        return NextResponse.json({
          userId: user.id,
          historyId: latestTriplet.id,
          profile: serializeUserProfile(user),
          reused: true,
        });
      }
    }

    step = "create_history";
    const history = await createHistoryEntry({
      userId: user.id,
      characterName: "triplet",
      contextData: {
        type: "triplet",
        tarotCards: tarotCards ?? [],
        teaser,
        onboarding: {
          name,
          gender,
          birthDate,
          zodiac,
          birthTime: normalizedBirthTime,
          birthCity: normalizedBirthCity,
          lifeFocus,
          mainQuestion,
          astroMeta,
        },
      },
    });

    return NextResponse.json({
      userId: user.id,
      historyId: history.id,
      profile: serializeUserProfile(user),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Onboarding error at step:", step, detail, error);
    return NextResponse.json(
      { error: "Ошибка сохранения профиля", code: "ONBOARDING_FAILED", step, detail },
      { status: 500 }
    );
  }
}

