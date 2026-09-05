import { workspaceFingerprint } from "./ai-harness-fingerprint.mjs";

/**
 * Machine COMPLETED gate. COMPLETED is allowed only on verdict PASS
 * and production PASS or NOT_REQUIRED.
 */
const STALE_MS = 4 * 60 * 60 * 1000;

export function evaluateStopGate({
  status,
  loopCount = 0,
  state = null,
  dirtyFiles = [],
  now = Date.now(),
  currentFingerprint,
} = {}) {
  if (status !== "completed") {
    return { action: "allow", reason: "not-completed" };
  }
  // Reaching a retry limit does not turn incomplete work into completed work.
  void loopCount;

  const work = isWorkSession(dirtyFiles, state);
  if (!work) {
    return { action: "allow", reason: "no-work-session" };
  }

  if (!state || typeof state !== "object") {
    return {
      action: "block",
      reason: "no-state",
      message:
        "COMPLETED запрещён: машинный gate не запускался. Выполни `node scripts/ai-harness.mjs --scope auto --level fast` (или full/production по задаче), исправь FAIL и повтори. Не ставь COMPLETED по предположению.",
    };
  }

  const updated = Date.parse(state.checksCompletedAt || state.updatedAt || "") || 0;
  if (!updated || now - updated > STALE_MS) {
    return {
      action: "block",
      reason: "stale-state",
      message:
        "COMPLETED запрещён: harness-state устарел или без updatedAt. Перезапусти `node scripts/ai-harness.mjs` на актуальном диффе.",
    };
  }

  if (state.verdict === "FAIL") {
    return {
      action: "block",
      reason: "fail",
      message:
        "COMPLETED запрещён: обязательная проверка FAIL. Исправь падения из `.cursor/harness-state.json`, повтори тот же scope/level, затем независимый review.",
    };
  }

  if (state.verdict === "PARTIAL") {
    return {
      action: "block",
      reason: "partial",
      message:
        "COMPLETED запрещён: статус PARTIAL. Либо запусти недостающие проверки, либо оставь PARTIAL с точной причиной — не COMPLETED.",
    };
  }

  if (state.verdict !== "PASS") {
    return {
      action: "block",
      reason: "unknown-verdict",
      message: `COMPLETED запрещён: неизвестный verdict=${String(state.verdict)}.`,
    };
  }

  const prod = state.production || "NOT_REQUIRED";
  if (prod !== "PASS" && prod !== "NOT_REQUIRED") {
    return {
      action: "block",
      reason: "production",
      message:
        "COMPLETED запрещён: production не PASS при требуемой проверке. Запусти `--level production` или зафиксируй NOT_REQUIRED только если прод не затрагивался.",
    };
  }

  const missing = (state.requiredChecks || []).filter((id) => {
    const row = (state.checks || []).find((c) => c.id === id);
    return !row || row.status !== "PASS";
  });
  if (missing.length) {
    return {
      action: "block",
      reason: "not-run",
      message: `COMPLETED запрещён: не запускались обязательные проверки: ${missing.join(", ")}.`,
    };
  }

  if (!state.diffFingerprint) {
    return { action: "block", reason: "missing-fingerprint", message: "COMPLETED запрещён: проверки не привязаны к содержимому диффа. Перезапусти harness." };
  }
  try {
    const current = currentFingerprint ?? workspaceFingerprint();
    if (current !== state.diffFingerprint) {
      return { action: "block", reason: "changed-diff", message: "COMPLETED запрещён: код изменился после проверок. Повтори проверки и независимый review на текущем диффе." };
    }
  } catch {
    return { action: "block", reason: "fingerprint-unavailable", message: "COMPLETED запрещён: не удалось проверить актуальность рабочего дерева." };
  }
  const requiredReviews = state.requiredReviews?.length ? state.requiredReviews : ["code"];
  const negativeReview = Object.entries(state.reviews || {}).find(([, result]) => result === "FAIL" || result === "PARTIAL");
  if (negativeReview) {
    return { action: "block", reason: "review", message: `COMPLETED запрещён: review ${negativeReview[0]}=${negativeReview[1]}. Отрицательное заключение требует исправления и повторной проверки.` };
  }
  for (const id of requiredReviews) {
    const result = state.reviews?.[id];
    if (result !== "PASS") {
      return { action: "block", reason: "review", message: `COMPLETED запрещён: независимый review ${id}=${result || "NOT_RUN"}. Исправь замечания и проведи повторный review.` };
    }
    const evidence = state.reviewEvidence?.[id];
    const reviewedAt = Date.parse(evidence?.reviewedAt || "") || 0;
    if (!evidence || evidence.result !== "PASS" || evidence.diffFingerprint !== state.diffFingerprint ||
      !reviewedAt || now - reviewedAt > STALE_MS || reviewedAt > now + 60_000) {
      return { action: "block", reason: "stale-review", message: `COMPLETED запрещён: review ${id} не подтверждён для актуального диффа. Требуется свежий независимый review.` };
    }
  }

  return { action: "allow", reason: "pass" };
}

export function isWorkSession(dirtyFiles = [], state = null) {
  if (state && ["FAIL", "PARTIAL", "PASS", "RUNNING"].includes(state.verdict)) {
    return true;
  }
  return dirtyFiles.some((f) =>
    /^(src|tests|scripts|telegram-bot|mobile|hosting|docs|\.cursor|package\.json|\.gitignore)\b/.test(
      String(f).replace(/\\/g, "/")
    )
  );
}

export function completedAllowed(state, currentFingerprint) {
  const r = evaluateStopGate({
    status: "completed",
    loopCount: 0,
    state,
    dirtyFiles: ["src/x.ts"],
    currentFingerprint,
  });
  return r.action === "allow" && r.reason === "pass";
}
