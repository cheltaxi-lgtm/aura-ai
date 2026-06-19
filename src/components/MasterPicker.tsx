"use client";

import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { resolveMasterDeckSystem } from "@/lib/decks";
import { DECK_SYSTEM_DISPLAY } from "@/lib/photo-spread-redraw";
import MasterAvatar from "@/components/MasterAvatar";

interface MasterPickerProps {
  masters: ShowcaseMaster[];
  value: string;
  onChange: (masterId: string) => void;
  disabled?: boolean;
}

export default function MasterPicker({ masters, value, onChange, disabled }: MasterPickerProps) {
  return (
    <div className="master-picker" role="listbox" aria-label="Выбор мастера">
      {masters.map((m) => {
        const selected = m.id === value;
        const system = m.system ?? resolveMasterDeckSystem(m.id);
        const theme = DECK_SYSTEM_DISPLAY[system] ?? m.title;
        return (
          <button
            key={m.id}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={`master-picker__option ${selected ? "master-picker__option--selected" : ""}`}
          >
            <MasterAvatar masterId={m.id} masterName={m.name} size="sm" thumb />
            <span className="master-picker__label">
              <span className="master-picker__name">{m.name}</span>
              <span className="master-picker__system">{theme}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
