"use client";

import { useId, useMemo, useState } from "react";

import {
  PALM_HAND_LABELS,
  PALM_HAND_SHAPE_LABELS,
  PALM_HAND_SHAPE_MEANINGS,
  PALM_LINE_KEYS,
  PALM_LINE_MEANINGS,
  PALM_LINE_NAMES,
  PALM_MOUNT_KEYS,
  PALM_MOUNT_MEANINGS,
  PALM_MOUNT_NAMES,
  type PalmLineKey,
  type PalmLineLength,
  type PalmLineQuality,
  type PalmMountKey,
  type PalmProminence,
  type PalmSnapshot,
  type PalmVerdict,
} from "@/lib/palm-constants";
import {
  PALM_MAP_LINES,
  PALM_MAP_MOUNTS,
  PALM_MAP_OUTLINE,
  PALM_MAP_VB,
} from "@/components/palm/palm-map-geometry";

type Feature = PalmLineKey | PalmMountKey | "shape";

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

function defaultFeature(verdict: PalmVerdict | undefined): Feature {
  if (verdict === "love") return "heart";
  if (verdict === "path") return "fate";
  if (verdict === "mind") return "head";
  if (verdict === "vitality") return "life";
  return "life";
}

function lineDash(quality: PalmLineQuality, length: PalmLineLength, present: boolean): string {
  if (!present) return "6 10";
  const shown = length === "short" ? 42 : length === "medium" ? 70 : 100;
  if (quality === "broken") return "8 7";
  if (quality === "chained") return "3 5";
  return `${shown} 100`;
}

/**
 * Canonical chiromancy diagram. Reads length/quality/notes from the snapshot.
 * Must never be drawn on the user photo — the snapshot has no landmarks.
 */
export default function PalmMap({
  snapshot,
}: {
  snapshot: Pick<PalmSnapshot, "whichHand" | "handShape" | "majorLines" | "mounts" | "verdict">;
}) {
  const uid = useId();
  const [selected, setSelected] = useState<Feature>(() => defaultFeature(snapshot.verdict));
  const flipLeft = snapshot.whichHand === "left";

  const lines = useMemo(
    () =>
      PALM_LINE_KEYS.map((key) => {
        const found = snapshot.majorLines.find((line) => line.key === key);
        return {
          key,
          present: found?.present ?? false,
          length: found?.length ?? "medium",
          quality: found?.quality ?? "clear",
          note: found?.note ?? "",
        };
      }),
    [snapshot.majorLines]
  );

  const mounts = useMemo(
    () =>
      PALM_MOUNT_KEYS.map((key) => {
        const found = snapshot.mounts?.find((mount) => mount.key === key);
        return {
          key,
          prominence: found?.prominence ?? "balanced",
          note: found?.note ?? "",
        };
      }),
    [snapshot.mounts]
  );

  const selectedLine = lines.find((line) => line.key === selected);
  const selectedMount = mounts.find((mount) => mount.key === selected);

  let title = `Тип руки — ${PALM_HAND_SHAPE_LABELS[snapshot.handShape]}`;
  let summary = PALM_HAND_SHAPE_MEANINGS[snapshot.handShape];
  let detail = "";
  if (selectedLine) {
    title = PALM_LINE_NAMES[selectedLine.key];
    summary = selectedLine.present
      ? `${LENGTH_RU[selectedLine.length]}, ${QUALITY_RU[selectedLine.quality]}. ${PALM_LINE_MEANINGS[selectedLine.key]}`
      : `На снимке слабо видна. ${PALM_LINE_MEANINGS[selectedLine.key]}`;
    detail = selectedLine.note;
  } else if (selectedMount) {
    title = PALM_MOUNT_NAMES[selectedMount.key];
    summary = `${PROMINENCE_RU[selectedMount.prominence]}. ${PALM_MOUNT_MEANINGS[selectedMount.key]}`;
    detail = selectedMount.note;
  }

  return (
    <div className="palm-map">
      <p className="palm-map__kicker">Карта ладони · {PALM_HAND_LABELS[snapshot.whichHand]}</p>
      <svg
        className="palm-map__svg"
        viewBox={`0 0 ${PALM_MAP_VB.w} ${PALM_MAP_VB.h}`}
        role="img"
        aria-labelledby={`${uid}-title`}
      >
        <title id={`${uid}-title`}>Схема линий и холмов ладони</title>
        <g transform={flipLeft ? `scale(-1,1) translate(-${PALM_MAP_VB.w},0)` : undefined}>
          <path className="palm-map__outline" d={PALM_MAP_OUTLINE} />
          {lines.map((line) => {
            const geo = PALM_MAP_LINES[line.key];
            const active = selected === line.key;
            return (
              <path
                key={line.key}
                className={`palm-map__line${active ? " palm-map__line--on" : ""}${
                  line.present ? "" : " palm-map__line--faint"
                }`}
                d={geo.d}
                pathLength={100}
                stroke={geo.color}
                strokeDasharray={lineDash(line.quality, line.length, line.present)}
                onClick={() => setSelected(line.key)}
              />
            );
          })}
          {mounts.map((mount) => {
            const geo = PALM_MAP_MOUNTS[mount.key];
            const active = selected === mount.key;
            const r = mount.prominence === "strong" ? 7 : mount.prominence === "weak" ? 4 : 5.5;
            return (
              <circle
                key={mount.key}
                className={`palm-map__mount${active ? " palm-map__mount--on" : ""}`}
                cx={geo.cx}
                cy={geo.cy}
                r={r}
                onClick={() => setSelected(mount.key)}
              />
            );
          })}
        </g>
      </svg>

      <div className="palm-map__chips" role="tablist" aria-label="Линии и холмы">
        <button
          type="button"
          role="tab"
          aria-selected={selected === "shape"}
          className={`palm-map__chip${selected === "shape" ? " palm-map__chip--on" : ""}`}
          onClick={() => setSelected("shape")}
        >
          Форма
        </button>
        {lines.map((line) => (
          <button
            key={line.key}
            type="button"
            role="tab"
            aria-selected={selected === line.key}
            className={`palm-map__chip${selected === line.key ? " palm-map__chip--on" : ""}`}
            onClick={() => setSelected(line.key)}
          >
            {PALM_LINE_NAMES[line.key].replace("Линия ", "")}
          </button>
        ))}
        {mounts
          .filter((mount) => mount.prominence !== "balanced" || mount.note.trim())
          .map((mount) => (
            <button
              key={mount.key}
              type="button"
              role="tab"
              aria-selected={selected === mount.key}
              className={`palm-map__chip${selected === mount.key ? " palm-map__chip--on" : ""}`}
              onClick={() => setSelected(mount.key)}
            >
              {PALM_MOUNT_NAMES[mount.key].replace("Холм ", "")}
            </button>
          ))}
      </div>

      <article className="palm-map__explain" aria-live="polite">
        <h3>{title}</h3>
        <p>{summary}</p>
        {detail.trim() ? <p>{detail.trim()}</p> : null}
      </article>
    </div>
  );
}
