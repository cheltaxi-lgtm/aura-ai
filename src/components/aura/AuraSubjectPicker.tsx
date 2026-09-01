"use client";

import { auraSubjectNameKey } from "@/lib/aura-subject-name";

export type AuraPickerSubject = {
  id: string;
  kind: "self" | "other";
  displayName: string;
  shotToday: boolean;
  lastColorKey: string | null;
  lastColorName: string | null;
};

type RecentAck = false | "new";

type Props = {
  subjects: AuraPickerSubject[];
  selectedId: string | null;
  creating: boolean;
  draftName: string;
  recentAck: RecentAck;
  nameClash: AuraPickerSubject | null;
  loggedIn: boolean;
  disabled?: boolean;
  onSelectSelf: () => void;
  onSelectExisting: (id: string) => void;
  onStartCreate: () => void;
  onDraftName: (name: string) => void;
  onAckNewPerson: () => void;
  onConfirmClash: () => void;
  onDismissClash: () => void;
};

/**
 * «Чья аура» — slot must be chosen before the camera.
 * Same person = same slot; a new name is a new core.
 */
export default function AuraSubjectPicker({
  subjects,
  selectedId,
  creating,
  draftName,
  recentAck,
  nameClash,
  loggedIn,
  disabled = false,
  onSelectSelf,
  onSelectExisting,
  onStartCreate,
  onDraftName,
  onAckNewPerson,
  onConfirmClash,
  onDismissClash,
}: Props) {
  const others = subjects.filter((s) => s.kind === "other");
  const self = subjects.find((s) => s.kind === "self") ?? null;
  const selfActive = !creating && (selectedId === null || selectedId === self?.id);
  const needsRecentAck = creating && loggedIn && others.length > 0 && recentAck !== "new";
  const clashKey = nameClash ? auraSubjectNameKey(nameClash.displayName) : "";
  const draftKey = auraSubjectNameKey(draftName);

  return (
    <section className="aura-picker">
      <p className="aura-picker__title">Чья аура</p>
      <div className="aura-picker__chips">
        <button
          type="button"
          disabled={disabled}
          onClick={onSelectSelf}
          className={`aura-picker__chip ${selfActive ? "aura-picker__chip--on" : ""}`}
        >
          Я
          {self?.shotToday ? <span className="aura-picker__dot" aria-hidden /> : null}
        </button>
        {others.map((subject) => {
          const active = !creating && selectedId === subject.id;
          return (
            <button
              key={subject.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectExisting(subject.id)}
              className={`aura-picker__chip ${active ? "aura-picker__chip--on" : ""}`}
            >
              {subject.displayName}
              {subject.shotToday ? <span className="aura-picker__dot" aria-hidden /> : null}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          onClick={onStartCreate}
          className={`aura-picker__chip ${creating ? "aura-picker__chip--on" : ""}`}
        >
          + Другой человек
        </button>
      </div>

      {creating ? (
        <div className="aura-picker__create">
          <p className="aura-picker__warn">
            Если это тот же человек — выберите его в списке, иначе цвет может быть
            другим.
          </p>
          {needsRecentAck ? (
            <div className="aura-picker__recent">
              <p>Это кто-то из них?</p>
              <div className="aura-picker__chips">
                {others.map((subject) => (
                  <button
                    key={`ack-${subject.id}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelectExisting(subject.id)}
                    className="aura-picker__chip"
                  >
                    {subject.displayName}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onAckNewPerson}
                  className="aura-picker__chip"
                >
                  Новый человек
                </button>
              </div>
            </div>
          ) : (
            <label className="aura-picker__name">
              <span>Имя</span>
              <input
                type="text"
                value={draftName}
                disabled={disabled}
                maxLength={40}
                autoComplete="off"
                placeholder="Как зовут этого человека"
                onChange={(e) => onDraftName(e.target.value)}
              />
            </label>
          )}
          {nameClash && draftKey && draftKey === clashKey ? (
            <div className="aura-picker__clash" role="status">
              <p>Это та {nameClash.displayName}?</p>
              <div className="aura-picker__chips">
                <button type="button" onClick={onConfirmClash} className="aura-picker__chip aura-picker__chip--on">
                  Да, открыть слот
                </button>
                <button type="button" onClick={onDismissClash} className="aura-picker__chip">
                  Нет, другое имя
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
