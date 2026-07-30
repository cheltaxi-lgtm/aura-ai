import type { Metadata } from "next";
import { sanitizeMiniAppPath } from "@/lib/telegram/mini-app";
import TgMiniAppClient from "./TgMiniAppClient";

export const metadata: Metadata = {
  title: "Zovus · Telegram",
  robots: { index: false, follow: false },
};

type TgPageProps = {
  searchParams: Promise<{ to?: string | string[] }>;
};

export default async function TelegramMiniAppEntryPage({ searchParams }: TgPageProps) {
  const params = await searchParams;
  const raw = params.to;
  const toParam = Array.isArray(raw) ? raw[0] : raw;
  const to = sanitizeMiniAppPath(toParam);

  return <TgMiniAppClient to={to} />;
}
