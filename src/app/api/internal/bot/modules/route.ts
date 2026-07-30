import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { botRunesShopUrl, resolveBotUser } from "@/lib/telegram/bot-resolve";

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
        native: true,
        url: `${site}/cabinet/astrology?${utm}`,
        note: "сводка + deep-link на полный отчёт",
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
        native: true,
        url: `${site}/cabinet?${utm}`,
        note: "список; создание на сайте",
      },
      {
        id: "joint",
        title: "Совместный расклад",
        native: true,
        url: `${site}/joint-reading?${utm}`,
        note: "список; создание на сайте",
      },
      { id: "diary", title: "Дневник", native: true, url: `${site}/cabinet?${utm}` },
      { id: "memory", title: "Память салона", native: true, url: `${site}/cabinet?${utm}` },
      {
        id: "photo",
        title: "Фото-расклад",
        native: true,
        url: `${site}/photo-rasklad?${utm}`,
        note: "список; загрузка фото на сайте",
      },
      { id: "support", title: "Поддержка", native: true, url: `${site}/cabinet/support?${utm}` },
    ],
  });
}
