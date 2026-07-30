import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { copy } from "../copy/ru.js";
import { clearFlow, getFlow, getUser, setFlow, setZovusUserId } from "../db/repos.js";
import { siteBotProfile } from "../domain/site-client.js";
import { CB, salonKeyboard } from "../keyboards/index.js";

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

export function genderKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Женский", `${CB.profGenderPrefix}female`)
    .text("Мужской", `${CB.profGenderPrefix}male`);
}

export async function beginProfileOnboarding(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  setFlow(ctx.from.id, "profile", "dob", {});
  await ctx.reply(copy.profileDobAsk, { reply_markup: salonKeyboard() });
}

export async function handleProfileFlowText(ctx: Context, text: string): Promise<boolean> {
  if (!ctx.from) return false;
  const flow = getFlow(ctx.from.id);
  if (!flow || flow.flow !== "profile") return false;

  if (flow.step === "dob") {
    const iso = parseBirthDateRu(text);
    if (!iso) {
      await ctx.reply(copy.profileDobInvalid, { reply_markup: salonKeyboard() });
      return true;
    }
    const age = ageFromIso(iso);
    if (age < 18) {
      await ctx.reply(copy.profileDobTooYoung, { reply_markup: salonKeyboard() });
      return true;
    }
    if (age > 120) {
      await ctx.reply(copy.profileDobInvalid, { reply_markup: salonKeyboard() });
      return true;
    }
    setFlow(ctx.from.id, "profile", "gender", { birthDate: iso });
    await ctx.reply(copy.profileGenderAsk, { reply_markup: genderKeyboard() });
    return true;
  }

  return true;
}

export async function handleProfileCallback(ctx: Context, data: string): Promise<boolean> {
  if (!data.startsWith(CB.profPrefix) || !ctx.from) return false;
  await ctx.answerCallbackQuery().catch(() => undefined);

  if (!data.startsWith(CB.profGenderPrefix)) return true;
  const gender = data.slice(CB.profGenderPrefix.length);
  if (gender !== "male" && gender !== "female") return true;

  const flow = getFlow(ctx.from.id);
  if (!flow || flow.flow !== "profile" || flow.step !== "gender") {
    await ctx.reply(copy.profileDobAsk, { reply_markup: salonKeyboard() });
    return true;
  }

  const birthDate = typeof flow.data?.birthDate === "string" ? flow.data.birthDate : "";
  if (!birthDate) {
    setFlow(ctx.from.id, "profile", "dob", {});
    await ctx.reply(copy.profileDobAsk, { reply_markup: salonKeyboard() });
    return true;
  }

  const user = getUser(ctx.from.id);
  try {
    const site = await siteBotProfile({
      telegramUserId: ctx.from.id,
      name: ctx.from.first_name || user?.first_name || null,
      birthDate,
      gender,
    });
    if (!site.ok || site.needsOnboarding) {
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
      return true;
    }
    if (site.profileUserId) setZovusUserId(ctx.from.id, site.profileUserId);
    clearFlow(ctx.from.id);
    const bal = site.runeBalance ?? 0;
    await ctx.reply(copy.profileReady(bal), { reply_markup: salonKeyboard() });
  } catch (err) {
    console.error("[profile] upsert", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
  return true;
}
