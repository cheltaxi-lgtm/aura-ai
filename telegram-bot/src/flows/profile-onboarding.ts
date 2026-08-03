import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { copy } from "../copy/ru.js";
import {
  clearFlow,
  getFlow,
  getUser,
  setFlow,
  setTimezoneOffset,
  setZovusUserId,
} from "../db/repos.js";
import {
  siteBotPlaces,
  siteBotProfile,
  type SiteBirthPlace,
} from "../domain/site-client.js";
import {
  birthCityKeyboard,
  CB,
  memoryChoiceKeyboard,
  NAV_LABELS,
  salonKeyboard,
  timezoneKeyboard,
} from "../keyboards/index.js";
import { showSalonHome } from "./helpers.js";

type ProfileFlowData = {
  birthDate?: string;
  birthCity?: string;
  gender?: "male" | "female";
  places?: SiteBirthPlace[];
};

type ProfileStep = "timezone" | "city" | "city_pick" | "dob" | "gender" | "memory";

const STEP_N: Record<ProfileStep, string> = {
  timezone: "1/5",
  city: "2/5",
  city_pick: "2/5",
  dob: "3/5",
  gender: "4/5",
  memory: "5/5",
};

function withStep(step: ProfileStep, body: string): string {
  return `Шаг ${STEP_N[step]}\n\n${body}`;
}

function parseBirthDateRu(raw: string): string | null {
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/.exec(raw.trim());
  if (!m) return null;
  let dd = Number(m[1]);
  let mm = Number(m[2]);
  let yyyy = Number(m[3]);
  if (yyyy < 100) yyyy += yyyy >= 30 ? 1900 : 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() + 1 !== mm || d.getUTCDate() !== dd) {
    return null;
  }
  return iso;
}

function ageFromIso(iso: string): number {
  const birth = new Date(`${iso}T12:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function flowData(raw: Record<string, unknown> | null | undefined): ProfileFlowData {
  return (raw || {}) as ProfileFlowData;
}

/** Hide salon reply keyboard while collecting profile fields. */
const hideBar = { remove_keyboard: true as const };

export function genderKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Женский", `${CB.profGenderPrefix}female`)
    .text("Мужской", `${CB.profGenderPrefix}male`);
}

async function askBirthCity(ctx: Context, data: ProfileFlowData = {}): Promise<void> {
  if (!ctx.from) return;
  setFlow(ctx.from.id, "profile", "city", data as Record<string, unknown>);
  await ctx.reply(withStep("city", copy.profileCityAsk), { reply_markup: hideBar });
}

async function askDob(ctx: Context, data: ProfileFlowData): Promise<void> {
  if (!ctx.from) return;
  setFlow(ctx.from.id, "profile", "dob", data as Record<string, unknown>);
  await ctx.reply(withStep("dob", copy.profileDobAsk), { reply_markup: hideBar });
}

async function askMemory(ctx: Context, data: ProfileFlowData): Promise<void> {
  if (!ctx.from) return;
  setFlow(ctx.from.id, "profile", "memory", data as Record<string, unknown>);
  await ctx.reply(withStep("memory", copy.profileMemoryAsk), {
    reply_markup: memoryChoiceKeyboard(),
  });
}

async function finishProfile(
  ctx: Context,
  data: ProfileFlowData,
  memoryChoice: "enabled" | "disabled"
): Promise<void> {
  if (!ctx.from) return;
  const birthDate = typeof data.birthDate === "string" ? data.birthDate : "";
  const birthCity = typeof data.birthCity === "string" ? data.birthCity : "";
  const gender = data.gender === "male" || data.gender === "female" ? data.gender : null;
  if (!birthDate) {
    await askDob(ctx, data);
    return;
  }
  if (!birthCity) {
    await askBirthCity(ctx, data);
    return;
  }
  if (!gender) {
    setFlow(ctx.from.id, "profile", "gender", data as Record<string, unknown>);
    await ctx.reply(withStep("gender", copy.profileGenderAsk), {
      reply_markup: genderKeyboard(),
    });
    return;
  }

  const user = getUser(ctx.from.id);
  try {
    const site = await siteBotProfile({
      telegramUserId: ctx.from.id,
      name: ctx.from.first_name || user?.first_name || null,
      birthDate,
      gender,
      birthCity,
      memoryChoice,
    });
    if (!site.ok || site.needsOnboarding) {
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
      return;
    }
    if (site.profileUserId) setZovusUserId(ctx.from.id, site.profileUserId);
    clearFlow(ctx.from.id);
    const bal = site.runeBalance ?? 0;
    await ctx.reply(copy.profileReady(bal), { reply_markup: salonKeyboard() });
    await showSalonHome(ctx, { name: ctx.from.first_name || user?.first_name });
  } catch (err) {
    console.error("[profile] upsert", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

/** Registration / site onboarding: timezone → city → DOB → gender → memory. */
export async function beginProfileOnboarding(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const user = getUser(ctx.from.id);
  if (user?.timezone_source !== "user") {
    setFlow(ctx.from.id, "profile", "timezone", {});
    await ctx.reply(withStep("timezone", copy.timezoneAsk), {
      reply_markup: timezoneKeyboard(),
    });
    return;
  }
  await askBirthCity(ctx);
}

/** Called from tz: callback when user is in registration timezone step. */
export async function continueProfileAfterTimezone(
  ctx: Context,
  minutes: number
): Promise<boolean> {
  if (!ctx.from) return false;
  const flow = getFlow(ctx.from.id);
  if (!flow || flow.flow !== "profile" || flow.step !== "timezone") return false;
  setTimezoneOffset(ctx.from.id, minutes);
  await askBirthCity(ctx, flowData(flow.data));
  return true;
}

export async function handleProfileFlowText(ctx: Context, text: string): Promise<boolean> {
  if (!ctx.from) return false;
  const flow = getFlow(ctx.from.id);
  if (!flow || flow.flow !== "profile") return false;

  // Bottom-bar / NAV labels must not become city search — exit flow and let routeNav run.
  if (NAV_LABELS.has(text.trim())) {
    clearFlow(ctx.from.id);
    return false;
  }

  const data = flowData(flow.data);

  if (flow.step === "timezone") {
    await ctx.reply(withStep("timezone", copy.timezoneAsk), {
      reply_markup: timezoneKeyboard(),
    });
    return true;
  }

  if (flow.step === "memory") {
    await ctx.reply(withStep("memory", copy.profileMemoryAsk), {
      reply_markup: memoryChoiceKeyboard(),
    });
    return true;
  }

  if (flow.step === "gender") {
    await ctx.reply(withStep("gender", copy.profileGenderAsk), {
      reply_markup: genderKeyboard(),
    });
    return true;
  }

  if (flow.step === "city" || flow.step === "city_pick") {
    const q = text.trim();
    if (q.length < 2) {
      await ctx.reply(withStep("city", copy.profileCityShort), { reply_markup: hideBar });
      return true;
    }
    try {
      const { places } = await siteBotPlaces(q, 6);
      if (!places.length) {
        await ctx.reply(withStep("city", copy.profileCityEmpty), { reply_markup: hideBar });
        return true;
      }
      setFlow(ctx.from.id, "profile", "city_pick", {
        ...data,
        places,
      } as unknown as Record<string, unknown>);
      await ctx.reply(withStep("city_pick", copy.profileCityPick), {
        reply_markup: birthCityKeyboard(places),
      });
    } catch (err) {
      console.error("[profile] places", err);
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    }
    return true;
  }

  if (flow.step === "dob") {
    const iso = parseBirthDateRu(text);
    if (!iso) {
      await ctx.reply(withStep("dob", copy.profileDobInvalid), { reply_markup: hideBar });
      return true;
    }
    const age = ageFromIso(iso);
    if (age < 18) {
      await ctx.reply(copy.profileDobTooYoung, { reply_markup: salonKeyboard() });
      return true;
    }
    if (age > 120) {
      await ctx.reply(withStep("dob", copy.profileDobInvalid), { reply_markup: hideBar });
      return true;
    }
    if (!data.birthCity) {
      await askBirthCity(ctx, { ...data, birthDate: iso });
      return true;
    }
    setFlow(ctx.from.id, "profile", "gender", {
      ...data,
      birthDate: iso,
    } as unknown as Record<string, unknown>);
    await ctx.reply(withStep("gender", copy.profileGenderAsk), {
      reply_markup: genderKeyboard(),
    });
    return true;
  }

  return true;
}

export async function handleProfileCallback(ctx: Context, data: string): Promise<boolean> {
  if (!data.startsWith(CB.profPrefix) || !ctx.from) return false;
  await ctx.answerCallbackQuery().catch(() => undefined);

  if (data.startsWith(CB.profCityPrefix)) {
    const idx = Number(data.slice(CB.profCityPrefix.length));
    const flow = getFlow(ctx.from.id);
    if (!flow || flow.flow !== "profile" || flow.step !== "city_pick") {
      await askBirthCity(ctx);
      return true;
    }
    const places = Array.isArray(flowData(flow.data).places)
      ? flowData(flow.data).places!
      : [];
    const place = Number.isInteger(idx) ? places[idx] : undefined;
    if (!place?.label) {
      await askBirthCity(ctx, flowData(flow.data));
      return true;
    }
    try {
      await ctx.editMessageText(`Город: ${place.label}`);
    } catch {
      /* ignore */
    }
    const next = { ...flowData(flow.data), birthCity: place.label };
    delete next.places;
    if (next.birthDate) {
      setFlow(ctx.from.id, "profile", "gender", next as unknown as Record<string, unknown>);
      await ctx.reply(withStep("gender", copy.profileGenderAsk), {
        reply_markup: genderKeyboard(),
      });
    } else {
      await askDob(ctx, next);
    }
    return true;
  }

  if (data === CB.profMemOn || data === CB.profMemOff) {
    const flow = getFlow(ctx.from.id);
    if (!flow || flow.flow !== "profile" || flow.step !== "memory") {
      await beginProfileOnboarding(ctx);
      return true;
    }
    const choice = data === CB.profMemOn ? "enabled" : "disabled";
    try {
      await ctx.editMessageText(
        choice === "enabled" ? "Память: включена" : "Память: без сохранения"
      );
    } catch {
      /* ignore */
    }
    await finishProfile(ctx, flowData(flow.data), choice);
    return true;
  }

  if (!data.startsWith(CB.profGenderPrefix)) return true;
  const gender = data.slice(CB.profGenderPrefix.length);
  if (gender !== "male" && gender !== "female") return true;

  const flow = getFlow(ctx.from.id);
  if (!flow || flow.flow !== "profile" || flow.step !== "gender") {
    await beginProfileOnboarding(ctx);
    return true;
  }

  const pdata = flowData(flow.data);
  const birthDate = typeof pdata.birthDate === "string" ? pdata.birthDate : "";
  const birthCity = typeof pdata.birthCity === "string" ? pdata.birthCity : "";
  if (!birthDate) {
    await askDob(ctx, pdata);
    return true;
  }
  if (!birthCity) {
    await askBirthCity(ctx, pdata);
    return true;
  }

  await askMemory(ctx, { ...pdata, gender });
  return true;
}
