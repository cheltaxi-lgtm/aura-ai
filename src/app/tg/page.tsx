import type { Metadata } from "next";
import {
  decodeMiniAppStartParam,
  sanitizeMiniAppPath,
} from "@/lib/telegram/mini-app";
import TgMiniAppClient from "./TgMiniAppClient";

export const metadata: Metadata = {
  title: "Zovus · Telegram",
  robots: { index: false, follow: false },
};

type TgPageProps = {
  searchParams: Promise<{
    to?: string | string[];
    tgWebAppStartParam?: string | string[];
    startapp?: string | string[];
  }>;
};

function firstParam(raw: string | string[] | undefined): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export default async function TelegramMiniAppEntryPage({ searchParams }: TgPageProps) {
  const params = await searchParams;
  const startRaw =
    firstParam(params.tgWebAppStartParam) || firstParam(params.startapp) || null;
  const fromStart = decodeMiniAppStartParam(startRaw);
  const fromTo = firstParam(params.to);
  const to = sanitizeMiniAppPath(fromStart || fromTo || "/cabinet");

  return <TgMiniAppClient to={to} />;
}
