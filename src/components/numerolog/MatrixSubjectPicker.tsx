"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MatrixSubject, MatrixSubjectKind } from "@/lib/services/matrix-subject-service";
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
  onRemove,
  disabled = false,
  allowKinds = ["child", "partner", "other"],
  /** Which subject chips to show. Defaults to everyone; pass `["child"]` for child matrix. */
  visibleKinds,
  /** Auto-pick «Я» when nothing selected. Off for child matrix. */
  defaultSelectSelf = true,
  /** Keep the create form open (child matrix needs name + date immediately). */
  forceCreateForm = false,
  title = "Чья матрица",
  createButtonLabel,
  costs,
}: {
  subjects: MatrixSubject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreated: (subject: MatrixSubject) => void;
  onCreate: (input: MatrixSubjectInput) => Promise<MatrixSubject>;
  /** Delete a non-self subject (reports for that person are wiped too). */
  onRemove?: (id: string) => Promise<void>;
  disabled?: boolean;
  allowKinds?: CreatableKind[];
  visibleKinds?: MatrixSubjectKind[];
  defaultSelectSelf?: boolean;
  forceCreateForm?: boolean;
  title?: string;
  createButtonLabel?: string;
  costs?: { subject?: number; child?: number };
}) {
  const [expanded, setExpanded] = useState(forceCreateForm);
  const [kind, setKind] = useState<CreatableKind>(allowKinds[0] ?? "other");
  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const visibleSubjects = useMemo(() => {
    if (!visibleKinds || visibleKinds.length === 0) return subjects;
    const allowed = new Set(visibleKinds);
    return subjects.filter((subject) => allowed.has(subject.kind));
  }, [subjects, visibleKinds]);

  useEffect(() => {
    if (!allowKinds.includes(kind)) {
      setKind(allowKinds[0] ?? "other");
    }
  }, [allowKinds, kind]);

  useEffect(() => {
    if (forceCreateForm) setExpanded(true);
  }, [forceCreateForm]);

  // Clear a selection that is no longer visible (e.g. «Я» after switching to child matrix).
  useEffect(() => {
    if (!selectedId || !visibleKinds || visibleKinds.length === 0) return;
    const selected = subjects.find((subject) => subject.id === selectedId);
    if (selected && !visibleKinds.includes(selected.kind)) {
      onSelect(null);
    }
  }, [onSelect, selectedId, subjects, visibleKinds]);

  // Default to «Я» only when still unselected after parent effects flush.
  // Parent initializeFlow used to set another person, then this effect overwrote
  // it with «Я» in the same paint — defer so deep-linked subjectId wins.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  useEffect(() => {
    if (!defaultSelectSelf || selectedId || disabled || visibleSubjects.length === 0) return;
    const timer = window.setTimeout(() => {
      if (selectedIdRef.current) return;
      const self = visibleSubjects.find((subject) => subject.kind === "self");
      if (self) onSelect(self.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [defaultSelectSelf, disabled, onSelect, selectedId, visibleSubjects]);

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
      if (!forceCreateForm) setExpanded(false);
      setDisplayName("");
      setBirthDate("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить профиль.");
    } finally {
      setBusy(false);
    }
  };

  const removeSubject = async (subject: MatrixSubject) => {
    if (!onRemove || subject.kind === "self" || removingId) return;
    const label =
      subject.displayName?.trim() || KIND_LABEL[subject.kind] || "этот профиль";
    const confirmed = window.confirm(
      `Удалить «${label}» из списка?\nСохранённые матрицы этого человека тоже будут удалены.`
    );
    if (!confirmed) return;
    setRemovingId(subject.id);
    setError("");
    try {
      await onRemove(subject.id);
      if (selectedId === subject.id) onSelect(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось удалить профиль.");
    } finally {
      setRemovingId(null);
    }
  };

  const addLabel =
    createButtonLabel ??
    (allowKinds.length === 1 && allowKinds[0] === "child"
      ? "+ Добавить ребёнка"
      : "+ Другой человек");

  return (
    <section className="rounded-2xl border border-aura-gold/15 bg-gradient-to-b from-amber-950/20 via-black/20 to-transparent p-4">
      <p className="text-xs uppercase tracking-widest text-amber-200/70">{title}</p>
      {visibleSubjects.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleSubjects.map((subject) => {
            const active = subject.id === selectedId;
            const date = subject.birthDate.slice(5).split("-").reverse().join(".");
            const canRemove = Boolean(onRemove) && subject.kind !== "self";
            const removing = removingId === subject.id;
            return (
              <div
                key={subject.id}
                className={`inline-flex max-w-full items-stretch overflow-hidden rounded-xl border text-sm transition ${
                  active
                    ? "border-aura-gold/55 bg-amber-950/45 text-aura-gold"
                    : "border-white/10 bg-black/30 text-white/70"
                } ${disabled || removing ? "opacity-50" : ""}`}
              >
                <button
                  type="button"
                  disabled={disabled || removing}
                  onClick={() => onSelect(subject.id)}
                  className={`min-w-0 px-3 py-2 text-left transition hover:bg-white/[0.04] disabled:opacity-50 ${
                    canRemove ? "pr-1.5" : ""
                  }`}
                >
                  <span className="font-medium">
                    {subject.kind === "self"
                      ? "Я"
                      : subject.displayName || KIND_LABEL[subject.kind]}
                  </span>
                  <span className="ml-1.5 text-xs text-white/45">{date}</span>
                </button>
                {canRemove ? (
                  <button
                    type="button"
                    disabled={disabled || Boolean(removingId)}
                    onClick={() => void removeSubject(subject)}
                    aria-label={`Удалить ${subject.displayName || KIND_LABEL[subject.kind]}`}
                    title="Удалить из списка"
                    className="border-l border-white/10 px-2 text-white/40 transition hover:bg-red-950/40 hover:text-red-300 disabled:opacity-50"
                  >
                    {removing ? "…" : "×"}
                  </button>
                ) : null}
              </div>
            );
          })}
          {!forceCreateForm ? (
            <button
              type="button"
              disabled={disabled || allowKinds.length === 0}
              onClick={() => {
                setExpanded((value) => !value);
                setError("");
              }}
              className="rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-3 py-2 text-sm text-white/70 transition hover:border-aura-gold/40 hover:text-aura-gold disabled:opacity-50"
            >
              {addLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {error && !expanded && !forceCreateForm ? (
        <p className="mt-2 text-xs text-red-300">{error}</p>
      ) : null}

      {forceCreateForm && !selectedId ? (
        <p className="mt-3 text-sm text-white/65">
          Укажите имя и дату рождения ребёнка — без этого детская матрица не считается.
        </p>
      ) : null}

      {expanded || forceCreateForm ? (
        <form
          onSubmit={submit}
          className={`mt-4 grid gap-3 ${visibleSubjects.length > 0 ? "border-t border-white/10 pt-4" : ""} sm:grid-cols-2`}
        >
          {allowKinds.length > 1 ? (
            <label className="text-xs text-white/60 sm:col-span-2">
              Кем вам приходится
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as CreatableKind)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/45"
              >
                {allowKinds.includes("child") ? (
                  <option value="child">
                    Ребёнок{costs?.child ? ` · ${costs.child} ᚢ` : ""}
                  </option>
                ) : null}
                {allowKinds.includes("partner") ? <option value="partner">Партнёр</option> : null}
                {allowKinds.includes("other") ? (
                  <option value="other">
                    Другой человек{costs?.subject ? ` · ${costs.subject} ᚢ` : ""}
                  </option>
                ) : null}
              </select>
            </label>
          ) : null}
          <label className="text-xs text-white/60">
            Имя{forceCreateForm ? "" : " (необязательно)"}
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required={forceCreateForm}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/45"
              placeholder={forceCreateForm ? "Имя ребёнка" : "Имя"}
            />
          </label>
          <label className="text-xs text-white/60">
            Дата рождения
            <input
              required
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/45"
            />
          </label>
          {error ? <p className="sm:col-span-2 text-xs text-red-300">{error}</p> : null}
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={disabled || busy}
              className="rounded-xl border border-aura-gold/40 bg-aura-gold/10 px-4 py-2 text-sm font-medium text-aura-gold disabled:opacity-50"
            >
              {busy ? "Сохраняем…" : forceCreateForm ? "Сохранить ребёнка" : "Сохранить и выбрать"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
