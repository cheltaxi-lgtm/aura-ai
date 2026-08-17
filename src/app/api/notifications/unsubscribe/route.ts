import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  applyReminderUnsubscribe,
  verifyReminderUnsubscribeToken,
} from "@/lib/reminder-unsubscribe";

export const dynamic = "force-dynamic";

function htmlPage(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Georgia,serif;max-width:32rem;margin:3rem auto;padding:0 1.25rem;color:#1a1a2e;line-height:1.5"><h1 style="font-size:1.25rem">${title}</h1><p>${body}</p><p><a href="https://zovus.ru/">Вернуться в Zovus</a></p></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function GET(request: NextRequest) {
  if (!(await ensureDb())) {
    return htmlPage("Сервис недоступен", "Попробуйте позже.", 503);
  }
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  const parsed = token ? await verifyReminderUnsubscribeToken(token) : null;
  if (!parsed) {
    return htmlPage("Ссылка недействительна", "Запросите новое письмо или отключите напоминание в кабинете.", 400);
  }
  await applyReminderUnsubscribe(parsed.accountId, parsed.topic);
  return htmlPage(
    "Напоминание отключено",
    "Это уведомление больше не будет приходить. Настройки можно снова включить в кабинете."
  );
}

export async function POST(request: NextRequest) {
  return GET(request);
}
