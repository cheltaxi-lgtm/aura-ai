"use client";

import { useEffect, useState } from "react";
import type { MatrixSubject } from "@/lib/services/matrix-subject-service";
import type { MatrixSubjectInput } from "@/hooks/useMatrixSubjects";

type CreatableKind = "child" | "partner" | "other";

const KIND_LABEL: Record<MatrixSubject["kind"], string> = {
  self: "Я",
  child: "Ребёнок",
  partner: "Партнёр",
  other: "Другой человек",
};

export default function MatrixSubjectPicker({
  subjects,
  selectedId,
  onSelect,
  onCreated,
  onCreate,
  disabled = false,
  allowKinds = ["child", "partner", "other"],
  costs,
}: {
  subjects: MatrixSubject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: (subject: MatrixSubject) => void;
  onCreate: (input: MatrixSubjectInput) => Promise<MatrixSubject>;
  disabled?: boolean;
  allowKinds?: CreatableKind[];
  costs?: { subject?: number; child?: number };
}) {
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState<CreatableKind>(allowKinds[0] ?? "other");
  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedId || disabled) return;
    const self = subjects.find((subject) => subject.kind === "self");
    if (self) onSelect(self.id);
  }, [disabled, onSelect, selectedId, subjects]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!birthDate) {
      setError("Укажите дату рождения.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const subject = await onCreate({ kind, displayName, birthDate });
      onCreated(subject);
      setExpanded(false);
      setDisplayName("");
      setBirthDate("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить профиль.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-aura-gold/15 bg-gradient-to-b from-amber-950/20 via-black/20 to-transparent p-4">
      <p className="text-xs uppercase tracking-widest text-amber-200/70">Чья матрица</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {subjects.map((subject) => {
          const active = subject.id === selectedId;
          const date = subject.birthDate.slice(5).split("-").reverse().join(".");
          return (
            <button
              key={subject.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(subject.id)}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition disabled:opacity-50 ${
                active
                  ? "border-aura-gold/55 bg-amber-950/45 text-aura-gold"
                  : "border-white/10 bg-black/30 text-white/70 hover:border-white/25"
              }`}
            >
              <span className="font-medium">{subject.kind === "self" ? "Я" : subject.displayName || KIND_LABEL[subject.kind]}</span>
              <span className="ml-1.5 text-xs text-white/45">{date}</span>
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled || allowKinds.length === 0}
          onClick={() => {
            setExpanded((value) => !value);
            setError("");
          }}
          className="rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-3 py-2 text-sm text-white/70 transition hover:border-aura-gold/40 hover:text-aura-gold disabled:opacity-50"
        >
          + Другой человек
        </button>
      </div>

      {expanded ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
          <label className="text-xs text-white/60">
            Кем вам приходится
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as CreatableKind)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/45"
            >
              {allowKinds.includes("child") ? <option value="child">Ребёнок{costs?.child ? ` · ${costs.child} ᚢ` : ""}</option> : null}
              {allowKinds.includes("partner") ? <option value="partner">Партнёр</option> : null}
              {allowKinds.includes("other") ? <option value="other">Другой человек{costs?.subject ? ` · ${costs.subject} ᚢ` : ""}</option> : null}
            </select>
          </label>
          <label className="text-xs text-white/60">
            Имя (необязательно)
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/45" placeholder="Имя" />
          </label>
          <label className="text-xs text-white/60">
            Дата рождения
            <input required type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/45" />
          </label>
          {error ? <p className="sm:col-span-3 text-xs text-red-300">{error}</p> : null}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={disabled || busy} className="rounded-xl border border-aura-gold/40 bg-aura-gold/10 px-4 py-2 text-sm font-medium text-aura-gold disabled:opacity-50">
              {busy ? "Сохраняем…" : "Сохранить и выбрать"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
