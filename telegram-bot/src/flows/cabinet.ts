import type { Context } from "grammy";
import { copy } from "../copy/ru.js";
import { clearFlow, getFlow, setFlow } from "../db/repos.js";
import {
  chunkTelegramText,
  siteCabinet,
  siteNatal,
  siteNumerology,
  siteReading,
  siteSupport,
} from "../domain/site-client.js";
import { presentReadingToTelegram } from "../domain/reading/present.js";
import {
  CB,
  chatFollowUpKeyboard,
  continueOnSiteKeyboard,
  dialogStopKeyboard,
  modulesKeyboard,
  salonKeyboard,
  supportListKeyboard,
} from "../keyboards/index.js";
import { ensureSiteLinked } from "./site-account.js";

function linkKb(url?: string | null) {
  return url ? continueOnSiteKeyboard(url) : salonKeyboard();
}

export async function showModulesMenu(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  await ctx.reply(copy.modulesPick, { reply_markup: modulesKeyboard() });
}

export async function showCabinetOverview(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteCabinet(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const lines = [
      copy.cabinetOverviewTitle,
      "",
      `Руны: ${data.runeBalance ?? "—"}`,
      data.natal?.hasChart
        ? `Натал: ${(data.natal.bigThree || []).join(" · ") || "есть карта"}`
        : "Натал: ещё не построен",
      `Обряды: ${data.rituals?.recent?.length ?? 0}`,
      `Совместные: ${data.joint?.items?.length ?? 0}`,
      `Дневник: ${data.diary?.length ?? 0}`,
      `Память: ${data.memory?.length ?? 0}`,
      `Поддержка: ${data.support?.tickets?.length ?? 0}`,
      `Матрицы: ${data.numerology?.matrices?.length ?? 0}`,
      `Фото: ${data.photo?.items?.length ?? 0}`,
    ];
    await ctx.reply(lines.join("\n"), {
      reply_markup: data.urls?.cabinet
        ? continueOnSiteKeyboard(data.urls.cabinet)
        : modulesKeyboard(),
    });
  } catch (err) {
    console.error("[cabinet] overview", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showNatal(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteNatal(linked.user.telegram_user_id);
    if (!data.ok || !data.natal) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    if (!data.natal.hasChart) {
      await ctx.reply(copy.natalEmpty, { reply_markup: linkKb(data.natal.url || data.url) });
      return;
    }
    const lines = [
      copy.natalTitle,
      "",
      ...(data.natal.bigThree.length ? data.natal.bigThree : ["Карта сохранена"]),
      data.natal.place ? `Место: ${data.natal.place}` : "",
      "",
      "Полный разбор и транзиты — на сайте.",
    ].filter(Boolean);
    await ctx.reply(lines.join("\n"), { reply_markup: linkKb(data.natal.url || data.url) });
  } catch (err) {
    console.error("[cabinet] natal", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showMatrix(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteNumerology(linked.user.telegram_user_id);
    if (!data.ok) {
      if (data.error === "needs_onboarding") {
        await ctx.reply(copy.matrixNeedsBirth, { reply_markup: linkKb(data.linkUrl) });
        return;
      }
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const arcs = (data.keyArcana || [])
      .map((a) => `${a.role}: ${a.title} (${a.number})`)
      .join("\n");
    const body = [
      copy.matrixTitle,
      data.birthDate ? `Дата: ${data.birthDate}` : "",
      "",
      data.portrait || "",
      "",
      arcs,
      "",
      data.moneyInsight || "",
      data.loveInsight || "",
      data.yearInsight || "",
      "",
      `Сохранённых отчётов: ${data.savedReports ?? 0}`,
    ]
      .filter((x) => x !== "")
      .join("\n");
    for (const chunk of chunkTelegramText(body)) {
      await ctx.reply(chunk, { reply_markup: linkKb(data.url) });
    }
  } catch (err) {
    console.error("[cabinet] matrix", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showRituals(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteCabinet(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const recent = data.rituals?.recent ?? [];
    if (!recent.length) {
      await ctx.reply(copy.ritualsEmpty, { reply_markup: linkKb(data.rituals?.url) });
      return;
    }
    const lines = [
      "Обряды",
      "",
      ...recent.map(
        (r, i) => `${i + 1}. ${r.title} · ${r.status}${r.characterKey ? ` · ${r.characterKey}` : ""}`
      ),
      "",
      "Новый обряд и полная карточка — на сайте.",
    ];
    await ctx.reply(lines.join("\n"), { reply_markup: linkKb(data.rituals?.url) });
  } catch (err) {
    console.error("[cabinet] rituals", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showJoint(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteCabinet(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const items = data.joint?.items ?? [];
    if (!items.length) {
      await ctx.reply(copy.jointEmpty, { reply_markup: linkKb(data.joint?.url) });
      return;
    }
    const lines = [
      "Совместные расклады",
      "",
      ...items.map(
        (j, i) => `${i + 1}. ${j.status} · ${String(j.createdAt).slice(0, 10)}\n${j.url}`
      ),
    ];
    await ctx.reply(lines.join("\n\n").slice(0, 3500), {
      reply_markup: linkKb(data.joint?.url),
    });
  } catch (err) {
    console.error("[cabinet] joint", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showDiary(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteCabinet(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const entries = data.diary ?? [];
    if (!entries.length) {
      await ctx.reply(copy.diaryEmpty, { reply_markup: linkKb(data.urls?.cabinet) });
      return;
    }
    const lines = entries.map(
      (d, i) =>
        `${i + 1}. ${d.characterKey || "запись"} · ${String(d.createdAt).slice(0, 10)}\n${d.text}`
    );
    await ctx.reply(lines.join("\n\n").slice(0, 3500), {
      reply_markup: linkKb(data.urls?.cabinet),
    });
  } catch (err) {
    console.error("[cabinet] diary", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showMemory(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteCabinet(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const facts = data.memory ?? [];
    if (!facts.length) {
      await ctx.reply(copy.memoryEmpty, { reply_markup: linkKb(data.urls?.cabinet) });
      return;
    }
    const lines = facts.map(
      (f, i) => `${i + 1}. ${f.category ? `[${f.category}] ` : ""}${f.fact}`
    );
    await ctx.reply(lines.join("\n\n").slice(0, 3500), {
      reply_markup: linkKb(data.urls?.cabinet),
    });
  } catch (err) {
    console.error("[cabinet] memory", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showPhoto(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteCabinet(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const items = data.photo?.items ?? [];
    if (!items.length) {
      await ctx.reply(`${copy.photoEmpty}\n\n${copy.photoNativeHint}`, {
        reply_markup: linkKb(data.photo?.url),
      });
      return;
    }
    const lines = [
      copy.photoNativeHint,
      "",
      ...items.map(
        (p, i) =>
          `${i + 1}. ${p.master || "мастер"} · ${String(p.createdAt || "").slice(0, 10)}`
      ),
    ];
    await ctx.reply(lines.join("\n"), { reply_markup: linkKb(data.photo?.url) });
  } catch (err) {
    console.error("[cabinet] photo", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showSupport(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteSupport(linked.user.telegram_user_id, "list");
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const tickets = data.tickets ?? [];
    if (!tickets.length) {
      await ctx.reply(copy.supportEmpty, {
        reply_markup: supportListKeyboard([], data.url),
      });
      return;
    }
    const lines = [
      copy.supportTitle,
      "",
      ...tickets.map(
        (t, i) =>
          `${i + 1}. ${t.subject} · ${t.status}${t.preview ? `\n${t.preview}` : ""}`
      ),
    ];
    await ctx.reply(lines.join("\n\n").slice(0, 3500), {
      reply_markup: supportListKeyboard(tickets, data.url),
    });
  } catch (err) {
    console.error("[cabinet] support", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function beginSupportCreate(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  setFlow(linked.user.telegram_user_id, "support", "await_message", {});
  await ctx.reply(copy.supportAskMessage, {
    reply_markup: dialogStopKeyboard(),
  });
}

export async function beginSupportReply(ctx: Context, ticketId: string): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  setFlow(linked.user.telegram_user_id, "support", "await_reply", { ticketId });
  await ctx.reply(copy.supportAskReply, {
    reply_markup: dialogStopKeyboard(),
  });
}

/** Bot no longer runs follow-up Q&A — send user to the site session chat. */
export async function beginChatFollowUp(ctx: Context, sessionId: string): Promise<void> {
  if (!ctx.from) return;
  clearFlow(ctx.from.id);
  await ctx.reply(
    "Вопросы по раскладу — на сайте, в том же сеансе. Нажмите кнопку ниже.",
    { reply_markup: chatFollowUpKeyboard(sessionId) }
  );
}

export async function stopActiveDialog(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  clearFlow(ctx.from.id);
  await ctx.reply(copy.chatStopped, { reply_markup: salonKeyboard() });
}

export async function openHistoryReading(ctx: Context, sessionId: string): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteReading(linked.user.telegram_user_id, sessionId);
    if (!data.ok || !data.reading) {
      await ctx.reply(copy.historyEmpty, { reply_markup: salonKeyboard() });
      return;
    }
    await ctx.replyWithChatAction("upload_photo");
    await presentReadingToTelegram(ctx, {
      reading: data.reading,
      cardNames: data.cards || [],
      question: data.intention,
      sessionId,
    });
  } catch (err) {
    console.error("[cabinet] reading", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

/** Handle free text for chat / support flows. Returns true if consumed. */
export async function handleCabinetText(ctx: Context, text: string): Promise<boolean> {
  if (!ctx.from) return false;
  const flow = getFlow(ctx.from.id);
  if (!flow) return false;

  if (flow.flow === "chat" && flow.step === "await_message") {
    const sessionId = typeof flow.data.sessionId === "string" ? flow.data.sessionId : "";
    clearFlow(ctx.from.id);
    if (sessionId) {
      await beginChatFollowUp(ctx, sessionId);
      return true;
    }
    return false;
  }

  if (flow.flow === "support" && flow.step === "await_message") {
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;
    try {
      const { data } = await siteSupport(linked.user.telegram_user_id, "create", {
        message: text,
      });
      clearFlow(linked.user.telegram_user_id);
      if (!data.ok) {
        await ctx.reply(data.message || copy.siteBridgeDown, {
          reply_markup: linkKb(data.linkUrl),
        });
        return true;
      }
      const reply = [copy.supportCreated, data.autoReply || ""].filter(Boolean).join("\n\n");
      await ctx.reply(reply.slice(0, 3500), { reply_markup: salonKeyboard() });
    } catch (err) {
      console.error("[cabinet] support create", err);
      clearFlow(linked.user.telegram_user_id);
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    }
    return true;
  }

  if (flow.flow === "support" && flow.step === "await_reply") {
    const ticketId = typeof flow.data.ticketId === "string" ? flow.data.ticketId : "";
    if (!ticketId) {
      clearFlow(ctx.from.id);
      return false;
    }
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;
    try {
      const { data } = await siteSupport(linked.user.telegram_user_id, "reply", {
        ticketId,
        message: text,
      });
      clearFlow(linked.user.telegram_user_id);
      if (!data.ok) {
        await ctx.reply(data.message || copy.siteBridgeDown, {
          reply_markup: linkKb(data.linkUrl),
        });
        return true;
      }
      const thread = (data.messages || [])
        .map((m) => `${m.role === "admin" ? "Поддержка" : "Вы"}: ${m.content}`)
        .join("\n\n");
      await ctx.reply((thread || "Сообщение отправлено.").slice(0, 3500), {
        reply_markup: salonKeyboard(),
      });
    } catch (err) {
      console.error("[cabinet] support reply", err);
      clearFlow(linked.user.telegram_user_id);
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    }
    return true;
  }

  return false;
}

export async function routeModuleCallback(ctx: Context, data: string): Promise<boolean> {
  switch (data) {
    case CB.modNatal:
      await showNatal(ctx);
      return true;
    case CB.modMatrix:
      await showMatrix(ctx);
      return true;
    case CB.modRituals:
      await showRituals(ctx);
      return true;
    case CB.modJoint:
      await showJoint(ctx);
      return true;
    case CB.modDiary:
      await showDiary(ctx);
      return true;
    case CB.modMemory:
      await showMemory(ctx);
      return true;
    case CB.modPhoto:
      await showPhoto(ctx);
      return true;
    case CB.modSupport:
      await showSupport(ctx);
      return true;
    case CB.modCabinet:
      await showCabinetOverview(ctx);
      return true;
    case CB.chatStop:
      await stopActiveDialog(ctx);
      return true;
    case CB.supportNew:
      await beginSupportCreate(ctx);
      return true;
    default:
      return false;
  }
}
