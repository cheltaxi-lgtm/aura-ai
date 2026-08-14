import { supersedeGroupForPredicate } from "@/lib/memory/predicates";

export type ContradictionKind = "temporal_update" | "probable_contradiction" | "same_fact";

export function normalizeFactText(fact: string): string {
  return fact
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

export function classifyFactConflict(
  existing: {
    fact: string;
    predicateKey?: string | null;
    subjectKey?: string | null;
    entityKey?: string | null;
  },
  incoming: {
    fact: string;
    predicateKey?: string | null;
    subjectKey?: string | null;
    entityKey?: string | null;
    operation?: "add" | "replace";
  }
): ContradictionKind {
  const existingText = normalizeFactText(existing.fact);
  const incomingText = normalizeFactText(incoming.fact);
  if (existingText === incomingText) return "same_fact";

  const sameSubject =
    (existing.subjectKey ?? "client") === (incoming.subjectKey ?? "client");
  const group = supersedeGroupForPredicate(incoming.predicateKey);
  const existingInGroup =
    Boolean(existing.predicateKey) && group.includes(existing.predicateKey!);

  if (
    sameSubject &&
    (incoming.operation === "replace" || existingInGroup) &&
    (existing.predicateKey !== incoming.predicateKey || existingInGroup)
  ) {
    return "temporal_update";
  }

  if (
    sameSubject &&
    existing.predicateKey &&
    incoming.predicateKey &&
    existing.predicateKey === incoming.predicateKey &&
    existingText !== incomingText
  ) {
    return "temporal_update";
  }

  return "probable_contradiction";
}
