"use client";

export default function BirthTimeOccurrence({ value, onChange, disabled = false }: {
  value: "" | "earlier" | "later";
  onChange: (value: "" | "earlier" | "later") => void;
  disabled?: boolean;
}) {
  return <details className="mt-3 rounded-xl border border-white/10 p-3 text-sm text-white/65">
    <summary className="cursor-pointer">Время при переводе часов</summary>
    <p className="mt-2 text-xs leading-5">При переводе часов назад одно время может наступать дважды. Выбирайте вариант только по документам или уточнённым данным рождения.</p>
    <label className="mt-2 block">Наступление времени
      <select value={value} disabled={disabled} onChange={event => onChange(event.target.value as "" | "earlier" | "later")}
        className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-[#15121b] px-3 text-white">
        <option value="">Не указано</option><option value="earlier">Первое (до перевода часов)</option><option value="later">Второе (после перевода часов)</option>
      </select>
    </label>
  </details>;
}
