"use client";

import { useState } from "react";

import PalmMap from "@/components/palm/PalmMap";
import {
  PALM_HAND_SHAPE_LABELS,
  PALM_HAND_SHAPE_MEANINGS,
  PALM_LINE_NAMES,
  PALM_MOUNT_NAMES,
  type PalmLineQuality,
  type PalmLineLength,
  type PalmProminence,
  type PalmSnapshot,
} from "@/lib/palm-constants";

const LENGTH_RU: Record<PalmLineLength, string> = {
  short: "короткая",
  medium: "средней длины",
  long: "длинная",
};

const QUALITY_RU: Record<PalmLineQuality, string> = {
  clear: "ясная",
  broken: "с разрывом",
  chained: "цепочная",
  forked: "с развилкой",
};

const PROMINENCE_RU: Record<PalmProminence, string> = {
  weak: "слабо выражен",
  balanced: "в равновесии",
  strong: "выражен",
};

function LineCard({
  title,
  summary,
  detail,
}: {
  title: string;
  summary: string;
  detail?: string;
}) {
  const [open, setOpen] = useState(false);
  const extra = detail?.trim();
  return (
    <article className="palm-insight">
      <h3>{title}</h3>
      <p>{summary}</p>
      {extra && extra !== summary ? (
        <>
          {open ? <p>{extra}</p> : null}
          <button type="button" onClick={() => setOpen((v) => !v)}>
            {open ? "Свернуть" : "Подробнее"}
          </button>
        </>
      ) : null}
    </article>
  );
}

/**
 * Paid reading surface: schematic map + text cards.
 * Cards have no SVG. The map is a canonical diagram, never a photo overlay.
 */
export default function PalmInsightCards({
  snapshot,
}: {
  snapshot: Pick<PalmSnapshot, "whichHand" | "handShape" | "majorLines" | "mounts" | "verdict">;
}) {
  if (!snapshot.majorLines?.length) return null;

  const notableMounts = (snapshot.mounts ?? []).filter(
    (mount) => mount.prominence !== "balanced" || mount.note.trim()
  );

  return (
    <div className="palm-insights-block">
      <PalmMap snapshot={snapshot} />
      <div className="palm-insights">
        <LineCard
          title={`Форма ладони — ${PALM_HAND_SHAPE_LABELS[snapshot.handShape]}`}
          summary={PALM_HAND_SHAPE_MEANINGS[snapshot.handShape]}
        />
        {snapshot.majorLines.map((line) => {
          const state = line.present
            ? `${LENGTH_RU[line.length]}, ${QUALITY_RU[line.quality]}`
            : "на фото слабо видна";
          return (
            <LineCard
              key={line.key}
              title={PALM_LINE_NAMES[line.key]}
              summary={state}
              detail={line.note}
            />
          );
        })}
        {notableMounts.map((mount) => (
          <LineCard
            key={mount.key}
            title={PALM_MOUNT_NAMES[mount.key]}
            summary={PROMINENCE_RU[mount.prominence]}
            detail={mount.note}
          />
        ))}
      </div>
    </div>
  );
}
