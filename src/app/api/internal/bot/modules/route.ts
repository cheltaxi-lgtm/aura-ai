import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { botRunesShopUrl, resolveBotUser } from "@/lib/telegram/bot-resolve";
import { isPalmReadingEnabled } from "@/lib/settings";

export const runtime = "nodejs";

/** Catalog of site modules reachable from the bot (native thin-client + deep-links). */
export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { telegram_user_id?: unknown };
  try {
    body = (await request.json()) as { telegram_user_id?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }

  const resolved = await resolveBotUser(telegramUserId);
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://zovus.ru").replace(/\/$/, "");
  const utm = "utm_source=telegram&utm_medium=bot&utm_campaign=modules";
  const palmOn = await isPalmReadingEnabled();

  return NextResponse.json({
    ok: true,
    linked: resolved.linked,
    linkUrl: resolved.linkUrl,
    modules: [
      { id: "spread", title: "Расклад / каталог", native: true, url: null },
      { id: "daily", title: "Энергия дня", native: true, url: null },
      { id: "history", title: "История", native: true, url: null },
      {
        id: "chat",
        title: "Вопрос по раскладу",
        native: false,
        url: `${site}/?${utm}`,
        note: "deep-link в сессию сайта (?chat_session=)",
      },
      { id: "runes", title: "Руны / баланс", native: true, url: botRunesShopUrl("modules") },
      { id: "cabinet", title: "Кабинет", native: true, url: `${site}/cabinet?${utm}` },
      {
        id: "astrology",
        title: "Натал / астрология",
        native: false,
        url: `${site}/cabinet/astrology?${utm}`,
        note: "тизер/сводка в боте; полный отчёт на сайте",
      },
      {
        id: "numerology",
        title: "Матрица судьбы",
        native: true,
        url: `${site}/cabinet?${utm}`,
        note: "free summary + полный разбор + список отчётов в боте",
      },
      {
        id: "rituals",
        title: "Обряды",
        native: false,
        url: `${site}/cabinet?${utm}`,
        note: "список-тизер в боте; создание на сайте",
      },
      {
        id: "joint",
        title: "Совместный расклад",
        native: false,
        url: `${site}/joint-reading?${utm}`,
        note: "список-тизер в боте; создание на сайте",
      },
      {
        id: "memory",
        title: "Память салона",
        native: false,
        url: `${site}/cabinet?${utm}`,
        note: "только на сайте",
      },
      {
        id: "photo",
        title: "Фото-расклад",
        native: true,
        url: `${site}/photo-rasklad?${utm}`,
        note: "полный native flow в боте; сайт — запасной deep-link",
      },
      ...(palmOn
        ? [
            {
              id: "palm",
              title: "Гадание по ладони",
              native: false,
              url: `${site}/gadanie-po-ladoni?${utm}`,
              note: "снимок на сайте; фото не хранится",
            },
          ]
        : []),
      { id: "support", title: "Поддержка", native: true, url: `${site}/cabinet/support?${utm}` },
    ],
  });
}
