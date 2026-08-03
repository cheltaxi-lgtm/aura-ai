import { InlineKeyboard, InputFile, type Bot, type Context } from "grammy";
import { copy } from "../copy/ru.js";
import { clearFlow, getFlow, setFlow } from "../db/repos.js";
import {
  siteRunes,
  siteRunesPurchase,
  type SiteRunePackage,
} from "../domain/site-client.js";
import {
  CB,
  NAV_LABELS,
  runesPayKeyboard,
  runesShopKeyboard,
  salonKeyboard,
} from "../keyboards/index.js";
import { renderRuneShopCardImage } from "../render/rune-shop-card.js";
import { announceWorking } from "./helpers.js";
import { ensureSiteLinked } from "./site-account.js";

let runesCopyCounter = 0;

const DEFAULT_MIN_RUB = 100;
const DEFAULT_MAX_RUB = 50_000;

async function presentShop(
  ctx: Context,
  opts: {
    balance: number;
    packages: SiteRunePackage[];
    shopUrl?: string | null;
    minCustomRub?: number;
    maxCustomRub?: number;
    rubPerRune?: number;
  }
): Promise<void> {
  const markup =
    opts.packages.length > 0 || opts.shopUrl
      ? runesShopKeyboard({
          packages: opts.packages.map((p) => ({
            id: p.id,
            name: p.name,
            totalRunes: p.totalRunes,
            priceRub: p.priceRub,
            isPopular: p.isPopular,
          })),
          shopUrl: opts.shopUrl,
          customAmount: true,
        })
      : salonKeyboard();

  try {
    const buf = await renderRuneShopCardImage({
      balance: opts.balance,
      packages: opts.packages.map((p) => ({
        name: p.name,
        totalRunes: p.totalRunes,
        priceRub: p.priceRub,
        bonusRunes: p.bonusRunes,
        isPopular: p.isPopular,
      })),
      customAmount: true,
      minCustomRub: opts.minCustomRub ?? DEFAULT_MIN_RUB,
    });
    await ctx.replyWithPhoto(new InputFile(buf, "runes.jpg"), { reply_markup: markup });
  } catch (err) {
    console.error("[runes] shop card", err);
    await ctx.reply(copy.runesShopIntro(opts.balance), { reply_markup: markup });
  }
}

async function sendPayLink(
  ctx: Context,
  pay: {
    ok?: boolean;
    paymentUrl?: string;
    packageName?: string;
    totalRunes?: number;
    priceRub?: number;
    shopUrl?: string;
    message?: string;
  }
): Promise<void> {
  if (!pay.ok || !pay.paymentUrl) {
    const shopUrl = pay.shopUrl || null;
    await ctx.reply(pay.message || "Не удалось создать оплату. Можно открыть кабинет.", {
      reply_markup: shopUrl
        ? new InlineKeyboard().url("🕯 Кабинет · оплата", shopUrl)
        : salonKeyboard(),
    });
    return;
  }
  const name = pay.packageName || "наполнение";
  const total = pay.totalRunes ?? 0;
  const rub = pay.priceRub ?? 0;
  await ctx.reply(copy.runesPayLink(name, total, rub), {
    reply_markup: runesPayKeyboard(pay.paymentUrl, rub),
  });
}

export async function showRunes(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  clearFlow(linked.user.telegram_user_id);
  await announceWorking(
    ctx,
    copy.cabinetPreparing(linked.user.telegram_user_id, runesCopyCounter++)
  );
  try {
    const { data } = await siteRunes(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
      return;
    }

    await presentShop(ctx, {
      balance: data.runeBalance ?? 0,
      packages: Array.isArray(data.packages) ? data.packages : [],
      shopUrl: data.shopUrl,
      minCustomRub: data.customAmount?.minRub,
      maxCustomRub: data.customAmount?.maxRub,
      rubPerRune: data.customAmount?.rubPerRune,
    });
  } catch (err) {
    console.error("[runes] site", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function handleRunesText(ctx: Context, text: string): Promise<boolean> {
  if (!ctx.from) return false;
  const flow = getFlow(ctx.from.id);
  if (!flow || flow.flow !== "runes" || flow.step !== "await_amount") return false;

  if (NAV_LABELS.has(text.trim())) {
    clearFlow(ctx.from.id);
    return false;
  }

  const digits = text.replace(/\D/g, "");
  const amount = digits ? parseInt(digits, 10) : NaN;
  const minRub =
    typeof flow.data.minRub === "number" ? flow.data.minRub : DEFAULT_MIN_RUB;
  const maxRub =
    typeof flow.data.maxRub === "number" ? flow.data.maxRub : DEFAULT_MAX_RUB;

  if (!Number.isFinite(amount) || amount <= 0) {
    await ctx.reply(copy.runesCustomInvalid, { reply_markup: salonKeyboard() });
    return true;
  }
  if (amount < minRub) {
    await ctx.reply(copy.runesCustomTooLow(minRub), { reply_markup: salonKeyboard() });
    return true;
  }
  if (amount > maxRub) {
    await ctx.reply(copy.runesCustomTooHigh(maxRub), { reply_markup: salonKeyboard() });
    return true;
  }

  const linked = await ensureSiteLinked(ctx);
  if (!linked) return true;

  clearFlow(ctx.from.id);
  await ctx.reply(copy.runesBuyOpening).catch(() => undefined);

  try {
    const { data: pay } = await siteRunesPurchase(linked.user.telegram_user_id, {
      customAmountRub: amount,
    });
    await sendPayLink(ctx, pay);
  } catch (err) {
    console.error("[runes] custom purchase", err);
    await ctx.reply("Не удалось открыть оплату. Загляните в кабинет на zovus.ru.", {
      reply_markup: salonKeyboard(),
    });
  }
  return true;
}

export async function handleRunesCallback(ctx: Context, data: string): Promise<boolean> {
  if (!data.startsWith(CB.rnPrefix)) return false;
  await ctx.answerCallbackQuery().catch(() => undefined);

  if (data === CB.rnCustom) {
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;

    let minRub = DEFAULT_MIN_RUB;
    let maxRub = DEFAULT_MAX_RUB;
    let rubPerRune = 2;
    try {
      const { data: shop } = await siteRunes(linked.user.telegram_user_id);
      if (shop.ok && shop.customAmount) {
        minRub = shop.customAmount.minRub || minRub;
        maxRub = shop.customAmount.maxRub || maxRub;
        rubPerRune = shop.customAmount.rubPerRune || rubPerRune;
      }
    } catch {
      /* defaults */
    }

    setFlow(linked.user.telegram_user_id, "runes", "await_amount", {
      minRub,
      maxRub,
      rubPerRune,
    });
    await ctx.reply(copy.runesCustomAsk(minRub, maxRub, rubPerRune), {
      reply_markup: salonKeyboard(),
    });
    return true;
  }

  if (!data.startsWith(CB.rnBuyPrefix)) return true;
  const packageId = data.slice(CB.rnBuyPrefix.length).trim();
  if (!packageId || !ctx.from) return true;

  const linked = await ensureSiteLinked(ctx);
  if (!linked) return true;

  clearFlow(linked.user.telegram_user_id);
  await ctx.reply(copy.runesBuyOpening).catch(() => undefined);

  try {
    const { data: pay } = await siteRunesPurchase(linked.user.telegram_user_id, {
      packageId,
    });
    await sendPayLink(ctx, pay);
  } catch (err) {
    console.error("[runes] purchase", err);
    let shopUrl: string | null = null;
    try {
      const again = await siteRunes(linked.user.telegram_user_id);
      shopUrl = again.data.shopUrl ?? null;
    } catch {
      /* ignore */
    }
    await ctx.reply("Не удалось открыть оплату. Загляните в кабинет на zovus.ru.", {
      reply_markup: shopUrl
        ? new InlineKeyboard().url("🕯 Кабинет · оплата", shopUrl)
        : salonKeyboard(),
    });
  }
  return true;
}

/** Stars checkout retired — leave handlers inert so old invoices cannot charge. */
export function registerRunePayments(bot: Bot): void {
  bot.on("pre_checkout_query", async (ctx) => {
    await ctx
      .answerPreCheckoutQuery(false, "Оплата Stars отключена. Купите руны картой в боте.")
      .catch(() => undefined);
  });

  bot.on("message:successful_payment", async (ctx) => {
    const pay = ctx.message?.successful_payment;
    if (!pay || pay.currency !== "XTR") return;
    await ctx.reply(
      "Оплата Stars больше не принимается. Если списали Stars — напишите в поддержку. Руны покупаются картой через ЮKassa.",
      { reply_markup: salonKeyboard() }
    );
  });
}
