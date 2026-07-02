import type { ShareKind, SharePublicPayload } from "./types";

export type OgVisualKind = ShareKind | "numerology" | "runes";

export interface OgTemplateProps {
  title: string;
  master: string;
  cards: string;
  kind: OgVisualKind;
}

const KIND_LABELS: Record<OgVisualKind, string> = {
  reading: "Расклад",
  session: "Сеанс",
  daily: "Энергия дня",
  triplet: "Три карты",
  ritual: "Ритуал",
  numerology: "Нумерология",
  runes: "Руны",
};

const KIND_ACCENT: Record<OgVisualKind, string> = {
  reading: "rgba(201, 162, 74, 0.9)",
  session: "rgba(201, 162, 74, 0.9)",
  daily: "rgba(147, 197, 253, 0.95)",
  triplet: "rgba(196, 181, 253, 0.95)",
  ritual: "rgba(251, 191, 36, 0.95)",
  numerology: "rgba(167, 139, 250, 0.95)",
  runes: "rgba(248, 113, 113, 0.95)",
};

export function resolveOgVisualKind(payload: SharePublicPayload, kind: ShareKind): OgVisualKind {
  const key = payload.masterKey ?? "";
  if (key === "numerolog" || /нумеролог/i.test(payload.title ?? "")) return "numerology";
  if (key === "ragnar" || payload.deckSystem?.startsWith("runes")) return "runes";
  return kind;
}

export function buildOgTemplateProps(payload: SharePublicPayload, kind: ShareKind): OgTemplateProps {
  const visualKind = resolveOgVisualKind(payload, kind);
  const rawTitle = payload.title ?? "Мой расклад";
  const title = rawTitle.length > 56 ? `${rawTitle.slice(0, 55)}…` : rawTitle;
  const master = payload.masterName ?? "";
  const cards = payload.cards?.map((c) => c.name).slice(0, 3).join("  ·  ") ?? "";
  return { title, master, cards, kind: visualKind };
}

export function ogKindLabel(kind: OgVisualKind): string {
  return KIND_LABELS[kind] ?? "Расклад";
}

export function ogKindAccent(kind: OgVisualKind): string {
  return KIND_ACCENT[kind] ?? KIND_ACCENT.reading;
}
