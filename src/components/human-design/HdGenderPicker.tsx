"use client";

import { useId } from "react";
import type { BinaryGender } from "@/lib/russian-name-gender";

interface HdGenderPickerProps {
  value: BinaryGender | null;
  onChange: (value: BinaryGender | null) => void;
  disabled?: boolean;
  label?: string;
}

/** Optional binary gender for other-person HD charts (LLM Russian address). */
export default function HdGenderPicker({
  value,
  onChange,
  disabled = false,
  label = "Пол",
}: HdGenderPickerProps) {
  const selectId = useId();
  const labelId = useId();

  return (
    <label className="hd-field" htmlFor={selectId}>
      <span className="hd-field__label" id={labelId}>
        {label}
      </span>
      <select
        id={selectId}
        value={value ?? ""}
        disabled={disabled}
        aria-labelledby={labelId}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "male" || v === "female" ? v : null);
        }}
        className="hd-field__input"
      >
        <option value="">Не указан</option>
        <option value="female">Женский</option>
        <option value="male">Мужской</option>
      </select>
    </label>
  );
}
