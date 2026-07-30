import { InputFile, type Bot, type Context } from "grammy";
import { copy } from "../copy/ru.js";
import {
  siteRunes,
  siteStarsCredit,
  siteStarsValidate,
  type SiteRunePackage,
} from "../domain/site-client.js";
import { CB, runesShopKeyboard, salonKeyboard } from "../keyboards/index.js";
import { renderRuneShopCardImage } from "../render/rune-shop-card.js";
import { announceWorking } from "./helpers.js";
import { ensureSiteLinked } from "./site-account.js";

let runesCopyCounter = 0;

function buildInvoicePayload(packageId: string, telegramUserId: number): string {
  const pkg = packageId.replace(/[^a-z0-9_-]/gi, "").slice(0, 32);
  const issued = Math.floor(Date.now() / 1000);
  return `runes:${pkg}:${telegramUserId}:${issued}`;
}

function parseInvoicePayload(payload: string): {
  packageId: string;
  telegramUserId: number;
} | null {
  const m = /^runes:([a-z0-9_-]+):(\d+):(\d+)$/i.exec((payload || "").trim());
  if (!m) return null;
  const packageId = m[1]!;
  const telegramUserId = Number(m[2]);
  if (!packageId || !Number.isFinite(telegramUserId) || telegramUserId <= 0) return null;
  return { packageId, telegramUserId };
}

async function presentShop(
  ctx: Context,
  opts: {
    balance: number;
    packages: SiteRunePackage[];
    shopUrl?: string | null;
  }
): Promise<void> {
  const markup =
    opts.packages.length > 0 || opts.shopUrl
      ? runesShopKeyboard({ packages: opts.packages, shopUrl: opts.shopUrl })
      : salonKeyboard();

  try {
    const buf = await renderRuneShopCardImage({
      balance: opts.balance,
      packages: opts.packages.map((p) => ({
        name: p.name,
        totalRunes: p.totalRunes,
        stars: p.stars,
        bonusRunes: p.bonusRunes,
        isPopular: p.isPopular,
      })),
    });
    await ctx.replyWithPhoto(new InputFile(buf, "runes.jpg"), { reply_markup: markup });
  } catch (err) {
    console.error("[runes] shop card", err);
    await ctx.reply(copy.runesShopIntro(opts.balance), { reply_markup: markup });
  }
}

export async function showRunes(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
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
    });
  } catch (err) {
    console.error("[runes] site", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function handleRunesCallback(ctx: Context, data: string): Promise<boolean> {
  if (!data.startsWith(CB.rnPrefix)) return false;
  await ctx.answerCallbackQuery().catch(() => undefined);

  if (!data.startsWith(CB.rnBuyPrefix)) return true;
  const packageId = data.slice(CB.rnBuyPrefix.length).trim();
  if (!packageId || !ctx.from || !ctx.chat) return true;

  const linked = await ensureSiteLinked(ctx);
  if (!linked) return true;

  let pkg: SiteRunePackage | undefined;
  try {
    const { data: shop } = await siteRunes(linked.user.telegram_user_id);
    if (!shop.ok) {
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
      return true;
    }
    pkg = (shop.packages || []).find((p) => p.id === packageId);
  } catch (err) {
    console.error("[runes] package lookup", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    return true;
  }

  if (!pkg || pkg.stars < 1) {
    await ctx.reply("Это наполнение сейчас недоступно.", { reply_markup: salonKeyboard() });
    return true;
  }

  await ctx.reply(copy.runesBuyOpening(pkg.name, pkg.totalRunes)).catch(() => undefined);

  const payload = buildInvoicePayload(pkg.id, linked.user.telegram_user_id);
  const title = copy.runesInvoiceTitle(pkg.name);
  const description = copy.runesInvoiceDescription(pkg);

  try {
    await ctx.api.sendInvoice(
      ctx.chat.id,
      title,
      description,
      payload,
      "XTR",
      [{ label: `${pkg.name} · ${pkg.totalRunes} ᚢ`, amount: pkg.stars }]
    );
  } catch (err) {
    console.error("[runes] sendInvoice", err);
    let shopUrl: string | null = null;
    try {
      const again = await siteRunes(linked.user.telegram_user_id);
      shopUrl = again.data.shopUrl ?? null;
    } catch {
      /* ignore */
    }
    await ctx.reply("Не удалось открыть счёт Stars. Можно картой в кабинете.", {
      reply_markup: runesShopKeyboard({ packages: [], shopUrl }),
    });
  }
  return true;
}

export function registerRunePayments(bot: Bot): void {
  bot.on("pre_checkout_query", async (ctx) => {
    const q = ctx.preCheckoutQuery;
    const fromId = q.from.id;
    try {
      const { data } = await siteStarsValidate({
        telegramUserId: fromId,
        invoicePayload: q.invoice_payload,
        totalAmount: q.total_amount,
      });
      if (data.ok) {
        await ctx.answerPreCheckoutQuery(true);
        return;
      }
      await ctx.answerPreCheckoutQuery(
        false,
        (data.message || "Не удалось подтвердить оплату.").slice(0, 200)
      );
    } catch (err) {
      console.error("[runes] pre_checkout", err);
      await ctx.answerPreCheckoutQuery(false, "Временная ошибка. Попробуйте позже.").catch(() => undefined);
    }
  });

  bot.on("message:successful_payment", async (ctx) => {
    const pay = ctx.message?.successful_payment;
    if (!pay || !ctx.from) return;
    if (pay.currency !== "XTR") return;

    const parsed = parseInvoicePayload(pay.invoice_payload);
    if (!parsed || parsed.telegramUserId !== ctx.from.id) {
      await ctx.reply("Оплата получена, но счёт не распознан. Напишите в поддержку.", {
        reply_markup: salonKeyboard(),
      });
      return;
    }

    try {
      const { data } = await siteStarsCredit({
        telegramUserId: ctx.from.id,
        packageId: parsed.packageId,
        telegramPaymentChargeId: pay.telegram_payment_charge_id,
        totalAmount: pay.total_amount,
        invoicePayload: pay.invoice_payload,
      });

      if (!data.ok) {
        await ctx.reply(
          data.error === "needs_link"
            ? "Оплата прошла, но аккаунт не привязан. Привяжите профиль — руны начислим через поддержку."
            : "Оплата прошла, начисление задерживается. Напишите в поддержку с чеком.",
          { reply_markup: salonKeyboard() }
        );
        console.error("[runes] stars-credit failed", data);
        return;
      }

      const added = data.runesAdded ?? 0;
      const bal = data.runeBalance ?? 0;
      const name = data.packageName || "наполнение";
      await ctx.reply(
        copy.runesCredited(added, name, bal, Boolean(data.alreadyCredited)),
        { reply_markup: salonKeyboard() }
      );
    } catch (err) {
      console.error("[runes] successful_payment", err);
      await ctx.reply(
        "Оплата получена, но сайт временно недоступен. Сохраните чек и напишите в поддержку.",
        { reply_markup: salonKeyboard() }
      );
    }
  });
}
