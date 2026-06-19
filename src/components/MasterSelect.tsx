"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { resolveMasterDeckSystem } from "@/lib/decks";
import { DECK_SYSTEM_DISPLAY } from "@/lib/photo-spread-redraw";
import MasterAvatar from "@/components/MasterAvatar";

interface MasterSelectProps {
  masters: ShowcaseMaster[];
  value: string;
  onChange: (masterId: string) => void;
  disabled?: boolean;
  className?: string;
}

function masterDeckLabel(master: ShowcaseMaster): string {
  const system = master.system ?? resolveMasterDeckSystem(master.id);
  return DECK_SYSTEM_DISPLAY[system] ?? master.title;
}

export default function MasterSelect({
  masters,
  value,
  onChange,
  disabled,
  className = "",
}: MasterSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = masters.find((m) => m.id === value) ?? masters[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const pick = (masterId: string) => {
    onChange(masterId);
    setOpen(false);
  };

  if (!selected) return null;

  const selectedTheme = masterDeckLabel(selected);

  return (
    <div ref={rootRef} className={`master-select ${className}`.trim()}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Мастер: ${selected.name}, ${selectedTheme}`}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        className="master-select__trigger"
      >
        <MasterAvatar masterId={selected.id} masterName={selected.name} size="sm" thumb />
        <span className="master-select__label">
          <span className="master-select__name">{selected.name}</span>
          <span className="master-select__system">{selectedTheme}</span>
        </span>
        <ChevronDown
          className={`master-select__chevron ${open ? "master-select__chevron--open" : ""}`}
          aria-hidden
        />
      </button>

      {open && !disabled ? (
        <ul className="master-select__menu" role="listbox" aria-label="Выбор мастера">
          {masters.map((m) => {
            const isSelected = m.id === value;
            const theme = masterDeckLabel(m);
            return (
              <li key={m.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pick(m.id)}
                  className={`master-select__option ${isSelected ? "master-select__option--selected" : ""}`}
                >
                  <MasterAvatar masterId={m.id} masterName={m.name} size="sm" thumb />
                  <span className="master-select__label">
                    <span className="master-select__name">{m.name}</span>
                    <span className="master-select__system">{theme}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
