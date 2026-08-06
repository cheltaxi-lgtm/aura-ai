"use client";

import { useId } from "react";
import {
  HD_CONNECTION_RELATIONS,
  type HdConnectionRelation,
} from "@/lib/human-design";

interface HdRelationPickerProps {
  value: HdConnectionRelation;
  onChange: (value: HdConnectionRelation) => void;
  disabled?: boolean;
  label?: string;
  /** `select` — compact form field (default). `cards` — larger radiogroup. */
  variant?: "select" | "cards";
}

/** Pair-report scenario: partner / friend / child / colleague / business. */
export default function HdRelationPicker({
  value,
  onChange,
  disabled = false,
  label = "Кем вам приходится",
  variant = "select",
}: HdRelationPickerProps) {
  const labelId = useId();
  const selectId = useId();

  if (variant === "select") {
    return (
      <label className="hd-field" htmlFor={selectId}>
        <span className="hd-field__label" id={labelId}>
          {label}
        </span>
        <select
          id={selectId}
          value={value}
          disabled={disabled}
          aria-labelledby={labelId}
          onChange={(e) => onChange(e.target.value as HdConnectionRelation)}
          className="hd-field__input"
        >
          {HD_CONNECTION_RELATIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} — {r.hint}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="hd-field">
      <p className="hd-field__label mb-2" id={labelId}>
        {label}
      </p>
      <div
        className="hd-connection__relations"
        role="radiogroup"
        aria-labelledby={labelId}
      >
        {HD_CONNECTION_RELATIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={value === r.id}
            className={value === r.id ? "is-active" : undefined}
            disabled={disabled}
            onClick={() => onChange(r.id)}
          >
            <strong>{r.label}</strong>
            <span>{r.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
