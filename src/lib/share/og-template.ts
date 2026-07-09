import { truncateAtWord } from "./build-url";
import type { ShareKind, SharePublicPayload } from "./types";

export type OgVisualKind = ShareKind | "numerology" | "runes";

export interface OgTemplateProps {
  title: string;
  master: string;
  cards: string;
  kind: OgVisualKind;
  teaser: string;
  date: string;
  isTopic: boolean;
}

const KIND_LABELS: Record<OgVisualKind, string> = {
  reading: "Личный расклад",
  session: "Сеанс с мастером",
  daily: "Энергия дня",
  triplet: "Три карты",
  ritual: "Ритуал",
  joint: "Совместный расклад",
  numerology: "Нумерология",
  runes: "Руны",
};

const KIND_ACCENT: Record<OgVisualKind, string> = {
  reading: "rgba(232, 199, 126, 0.95)",
  session: "rgba(232, 199, 126, 0.95)",
  daily: "rgba(147, 197, 253, 0.95)",
  triplet: "rgba(196, 181, 253, 0.95)",
  ritual: "rgba(251, 191, 36, 0.95)",
  joint: "rgba(244, 114, 182, 0.95)",
  numerology: "rgba(167, 139, 250, 0.95)",
  runes: "rgba(248, 113, 113, 0.95)",
};

function isUserTopicTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (t.length > 72) return true;
  if (/[.!?]\s+\S/.test(t)) return true;
  if (t.split(",").length >= 2) return true;
  return false;
}

function firstExcerptLine(excerpt: string, maxLen = 100): string {
  const plain = excerpt.trim().replace(/\s+/g, " ");
  if (!plain) return "";
  const sentenceMatch = plain.match(/^[^.!?…]+[.!?…]/);
  const candidate = sentenceMatch ? sentenceMatch[0].trim() : plain;
  return truncateAtWord(candidate, maxLen);
}

export function resolveOgVisualKind(payload: SharePublicPayload, kind: ShareKind): OgVisualKind {
  const key = payload.masterKey ?? "";
  if (key === "numerolog" || /нумеролог/i.test(payload.title ?? "")) return "numerology";
  if (key === "ragnar" || payload.deckSystem?.startsWith("runes")) return "runes";
  return kind;
}

export function buildOgTemplateProps(payload: SharePublicPayload, kind: ShareKind): OgTemplateProps {
  const visualKind = resolveOgVisualKind(payload, kind);
  const rawTitle = payload.title ?? "Мой расклад";
  const isTopic = isUserTopicTitle(rawTitle);
  const title = truncateAtWord(rawTitle, isTopic ? 72 : 48);
  const master = payload.masterName ?? "";
  const cards = payload.cards?.map((c) => c.name).slice(0, 4).join("  ◆  ") ?? "";
  const teaser = payload.excerpt ? firstExcerptLine(payload.excerpt) : "";
  const date = payload.date?.trim() ?? "";
  return { title, master, cards, kind: visualKind, teaser, date, isTopic };
}

export function ogKindLabel(kind: OgVisualKind): string {
  return KIND_LABELS[kind] ?? "Личный расклад";
}

export function ogKindAccent(kind: OgVisualKind): string {
  return KIND_ACCENT[kind] ?? KIND_ACCENT.reading;
}
