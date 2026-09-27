export type ActivationStage = "profile_missing" | "result_ready" | "preview_only" | "started" | "not_started";

export function activationLabel(stage: unknown): string {
  switch (stage) {
    case "profile_missing": return "Профиль не создан";
    case "result_ready": return "Результат готов";
    case "preview_only": return "Только предварительный результат";
    case "started": return "Начал, результата пока нет";
    case "not_started": return "Начало не зафиксировано";
    default: return "Данные недоступны";
  }
}
