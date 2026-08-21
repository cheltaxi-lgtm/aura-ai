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
} = {}) {
  if (status !== "completed") {
    return { action: "allow", reason: "not-completed" };
  }
  if (loopCount >= 3) {
    return { action: "allow", reason: "loop-limit" };
  }

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

  const updated = Date.parse(state.updatedAt || "") || 0;
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

export function completedAllowed(state) {
  const r = evaluateStopGate({
    status: "completed",
    loopCount: 0,
    state,
    dirtyFiles: ["src/x.ts"],
  });
  return r.action === "allow" && r.reason === "pass";
}
