"use client";

import { useState } from "react";
import {
  polishProReportPlainText,
  polishProReportTitle,
} from "@/modules/pro/ai/report-plain";
import type { ProReportBlock } from "@/modules/pro/domain/types";

export type ProReportSectionBlock = Pick<
  ProReportBlock,
  | "id"
  | "title"
  | "body"
  | "practice"
  | "eyebrow"
  | "sectionKind"
  | "arcanaNumber"
>;

const ARCANA_IN_TITLE_RE =
  /\(\s*(\d{1,2})\s*[—–-]\s*([^)]+?)\s*\)\s*$/u;

/** Keep in sync with extractPracticeFromBody (pro-premium-normalize). */
const PRACTICE_MARKER_RE =
  /(?:^|\n|[.!?…;:—–-]\s*)(?:Практика|Чрактика|Что\s+делать)\s*[:.]?\s+/giu;

function splitLegacyPractice(body: string): {
  prose: string;
  practice: string | null;
} {
  const text = String(body || "").replace(/\r\n/g, "\n").trim();
  if (!text) return { prose: "", practice: null };
  PRACTICE_MARKER_RE.lastIndex = 0;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = PRACTICE_MARKER_RE.exec(text)) !== null) last = m;
  if (!last) return { prose: text, practice: null };
  const marker = last[0];
  const markerAt = last.index;
  const proseEnd = /^[.!?…;:—–-]/.test(marker) ? markerAt + 1 : markerAt;
  const prose = text.slice(0, proseEnd).trim();
  const practice = text
    .slice(markerAt + marker.length)
    .replace(/\s+/g, " ")
    .trim();
  if (!practice) return { prose: text, practice: null };
  return { prose, practice };
}

function resolveDisplay(block: ProReportSectionBlock): {
  title: string;
  eyebrow: string | null;
  prose: string;
  practice: string | null;
  kind: string;
} {
  const kind = block.sectionKind || "generic";
  let title = polishProReportTitle(block.title || "");
  let eyebrow =
    typeof block.eyebrow === "string" && block.eyebrow.trim()
      ? polishProReportTitle(block.eyebrow)
      : null;

  if (!eyebrow) {
    const m = title.match(ARCANA_IN_TITLE_RE);
    if (m) {
      eyebrow = `${m[1]} — ${m[2].trim()}`;
      title = title.replace(ARCANA_IN_TITLE_RE, "").trim();
    }
  }

  let practice =
    typeof block.practice === "string" && block.practice.trim()
      ? polishProReportPlainText(block.practice)
      : null;
  let prose = polishProReportPlainText(block.body || "");
  if (!practice) {
    const split = splitLegacyPractice(prose);
    prose = split.prose;
    practice = split.practice ? polishProReportPlainText(split.practice) : null;
  }

  return { title, eyebrow, prose, practice, kind };
}

export default function ProReportSections({
  blocks,
  variant = "public",
  editable = false,
  onChange,
  onRefine,
  refiningIndex = null,
}: {
  blocks: ProReportSectionBlock[];
  variant?: "public" | "print";
  /** Case preview: same cards + title/body/practice editors. */
  editable?: boolean;
  onChange?: (index: number, patch: Partial<ProReportSectionBlock>) => void;
  /** Case preview: AI-rewrite one block with a practitioner instruction. */
  onRefine?: (index: number, instruction: string) => void;
  refiningIndex?: number | null;
}) {
  if (!blocks?.length) return null;

  return (
    <div
      className={
        variant === "print"
          ? "pro-report-sections mt-8 space-y-5"
          : "pro-public__blocks pro-report-sections mt-8 space-y-5"
      }
    >
      {blocks.map((raw, idx) => {
        const b = resolveDisplay(raw);
        const panelClass =
          variant === "print"
            ? `pro-report-card pro-report-card--${b.kind} pro-public__section`
            : `pro-panel pro-report-card pro-report-card--${b.kind} pro-public__section`;

        return (
          <section key={raw.id} className={panelClass}>
            <header className="pro-report-card__head">
              {b.eyebrow ? (
                <p className="pro-report-card__eyebrow">{b.eyebrow}</p>
              ) : null}
              {editable ? (
                <input
                  className="pro-public__block-title pro-report-card__title mb-0 w-full bg-transparent"
                  value={raw.title}
                  onChange={(e) => onChange?.(idx, { title: e.target.value })}
                  aria-label="Заголовок раздела"
                />
              ) : (
                <h2 className="pro-public__block-title pro-report-card__title">
                  {b.title}
                </h2>
              )}
            </header>
            {editable ? (
              <textarea
                className="pro-report-card__body mt-3 w-full rounded bg-black/20 p-2 text-sm leading-relaxed text-gray-200"
                rows={8}
                value={raw.body}
                onChange={(e) => onChange?.(idx, { body: e.target.value })}
                aria-label="Текст раздела"
              />
            ) : b.prose ? (
              <div className="pro-report-card__body mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
                {b.prose}
              </div>
            ) : null}
            {editable ? (
              <div className="pro-report-practice mt-4">
                <p className="pro-report-practice__label">Практика</p>
                <textarea
                  className="pro-report-practice__text mt-1 w-full rounded bg-black/20 p-2 text-sm text-gray-200"
                  rows={3}
                  value={raw.practice || ""}
                  onChange={(e) =>
                    onChange?.(idx, { practice: e.target.value || null })
                  }
                  aria-label="Практика раздела"
                  placeholder="Одно конкретное действие…"
                />
              </div>
            ) : b.practice ? (
              <div className="pro-report-practice mt-4">
                <p className="pro-report-practice__label">Практика</p>
                <p className="pro-report-practice__text">{b.practice}</p>
              </div>
            ) : null}
            {editable && onRefine ? (
              <RefineBlockControl
                index={idx}
                busy={refiningIndex !== null}
                active={refiningIndex === idx}
                onSubmit={onRefine}
              />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function RefineBlockControl({
  index,
  busy,
  active,
  onSubmit,
}: {
  index: number;
  busy: boolean;
  active: boolean;
  onSubmit: (index: number, instruction: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        className="mt-3 text-xs text-[var(--pro-faint,#888)] underline-offset-2 hover:text-[var(--pro-accent-light)] hover:underline"
        onClick={() => setOpen(true)}
      >
        Уточнить с ИИ
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--pro-border)] bg-black/20 p-3">
      <input
        className="w-full rounded bg-black/30 px-2 py-1.5 text-xs text-gray-200"
        placeholder="Инструкция: «теплее», «короче», «больше про отношения»…"
        value={instruction}
        maxLength={500}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn-primary px-3 py-1 text-xs"
          disabled={busy || !instruction.trim()}
          onClick={() => {
            onSubmit(index, instruction.trim());
            setInstruction("");
          }}
        >
          {active ? "Переписываю…" : "Переписать секцию"}
        </button>
        <button
          type="button"
          className="px-3 py-1 text-xs text-[var(--pro-faint,#888)]"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
