"use client";

/** Premium durable-job UX: honest wait copy without fake progress bars. */
export default function AsyncJobProgressNotice({
  active,
  label = "Генерация продолжается",
}: {
  active: boolean;
  label?: string;
}) {
  if (!active) return null;
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-50/90"
    >
      <p className="font-medium text-amber-100">{label}</p>
      <p className="mt-1 text-amber-50/70">
        Можно закрыть страницу — результат сохранится. После обновления ожидание
        восстановится автоматически.
      </p>
    </div>
  );
}
