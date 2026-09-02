"use client";

import Image from "next/image";
import { type KeyboardEvent, useId, useMemo, useState } from "react";

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

function lineWindow(length: PalmLineLength): number {
  if (length === "short") return 48;
  if (length === "medium") return 76;
  return 100;
}

function qualityDash(quality: PalmLineQuality, present: boolean): string | undefined {
  if (!present) return "3 10";
  if (quality === "broken") return "13 8";
  if (quality === "chained") return "1 6";
  return undefined;
}

function mountScale(prominence: PalmProminence): number {
  if (prominence === "strong") return 1.12;
  if (prominence === "weak") return 0.86;
  return 1;
}

/**
 * A photographed palm with a semantic interactive reading layer.
 * Must never be drawn on the user photo: the stored snapshot has no landmarks.
 */
export default function PalmMap({
  snapshot,
}: {
  snapshot: Pick<PalmSnapshot, "whichHand" | "handShape" | "majorLines" | "mounts" | "verdict">;
}) {
  const uid = useId().replace(/:/g, "");
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

  function selectFromKey(event: KeyboardEvent<SVGElement>, feature: Feature) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelected(feature);
  }

  return (
    <figure className="palm-map">
      <figcaption className="palm-map__intro">
        <p className="palm-map__kicker">Карта чтения · {PALM_HAND_LABELS[snapshot.whichHand]}</p>
        <h2 className="palm-map__title">Рисунок вашей ладони</h2>
        <p className="palm-map__lead">
          Основные линии и зоны, отмеченные по результату анализа фотографии
        </p>
      </figcaption>

      <div className="palm-map__surface">
        <div className={`palm-map__visual${flipLeft ? " palm-map__visual--left" : ""}`}>
          <Image
            className="palm-map__photo"
            src="/palm/palm-realistic-right-v1.png"
            width={PALM_MAP_VB.w}
            height={PALM_MAP_VB.h}
            sizes="(max-width: 560px) 88vw, 30rem"
            alt=""
          />
          <svg
            className="palm-map__svg"
            viewBox={`0 0 ${PALM_MAP_VB.w} ${PALM_MAP_VB.h}`}
            role="group"
            aria-labelledby={`${uid}-title ${uid}-description`}
          >
            <title id={`${uid}-title`}>Карта основных линий и холмов ладони</title>
            <desc id={`${uid}-description`}>
              Выберите линию или область ладони, чтобы прочитать её состояние и значение.
            </desc>
            <defs>
              <linearGradient id={`${uid}-line`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#b98445" />
                <stop offset="0.48" stopColor="#fff0c9" />
                <stop offset="1" stopColor="#9d632e" />
              </linearGradient>
              <filter id={`${uid}-soft`} x="-45%" y="-45%" width="190%" height="190%">
                <feGaussianBlur stdDeviation="24" />
              </filter>
              <filter id={`${uid}-line-glow`} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {lines.map((line) => {
                const shown = lineWindow(line.length);
                return (
                  <mask
                    key={line.key}
                    id={`${uid}-window-${line.key}`}
                    maskUnits="userSpaceOnUse"
                    x="0"
                    y="0"
                    width={PALM_MAP_VB.w}
                    height={PALM_MAP_VB.h}
                  >
                    <path
                      d={PALM_MAP_LINES[line.key].d}
                      pathLength={100}
                      fill="none"
                      stroke="white"
                      strokeWidth={36}
                      strokeLinecap="round"
                      strokeDasharray={`${shown} ${Math.max(0.01, 100 - shown)}`}
                    />
                  </mask>
                );
              })}
            </defs>

            <g className="palm-map__mounts">
              {mounts.map((mount) => {
                const geo = PALM_MAP_MOUNTS[mount.key];
                const active = selected === mount.key;
                const scale = mountScale(mount.prominence);
                const transform = geo.rotate
                  ? `rotate(${geo.rotate} ${geo.cx} ${geo.cy})`
                  : undefined;
                return (
                  <g key={mount.key}>
                    <ellipse
                      className={`palm-map__mount-zone palm-map__mount-zone--${mount.prominence}${
                        active ? " palm-map__mount-zone--on" : ""
                      }`}
                      cx={geo.cx}
                      cy={geo.cy}
                      rx={geo.rx * scale}
                      ry={geo.ry * scale}
                      transform={transform}
                      filter={`url(#${uid}-soft)`}
                      aria-hidden="true"
                    />
                    <ellipse
                      className="palm-map__mount-hit"
                      cx={geo.cx}
                      cy={geo.cy}
                      rx={Math.max(72, geo.rx + 28)}
                      ry={Math.max(72, geo.ry + 28)}
                      transform={transform}
                      role="button"
                      tabIndex={0}
                      aria-label={`${PALM_MOUNT_NAMES[mount.key]}: ${PROMINENCE_RU[mount.prominence]}`}
                      aria-pressed={active}
                      onClick={() => setSelected(mount.key)}
                      onKeyDown={(event) => selectFromKey(event, mount.key)}
                    />
                  </g>
                );
              })}
            </g>

            <g className="palm-map__lines">
              {lines.map((line) => {
                const geo = PALM_MAP_LINES[line.key];
                const active = selected === line.key;
                const mask = `url(#${uid}-window-${line.key})`;
                const state = line.present
                  ? `${LENGTH_RU[line.length]}, ${QUALITY_RU[line.quality]}`
                  : "на снимке слабо видна";
                return (
                  <g key={line.key}>
                    <path className="palm-map__line-shadow" d={geo.d} mask={mask} aria-hidden="true" />
                    <path
                      className={`palm-map__line${active ? " palm-map__line--on" : ""}${
                        line.present ? "" : " palm-map__line--faint"
                      }`}
                      d={geo.d}
                      pathLength={100}
                      mask={mask}
                      stroke={`url(#${uid}-line)`}
                      strokeDasharray={qualityDash(line.quality, line.present)}
                      filter={active ? `url(#${uid}-line-glow)` : undefined}
                      aria-hidden="true"
                    />
                    {line.present && line.quality === "forked" ? (
                      <path
                        className={`palm-map__line palm-map__line-fork${
                          active ? " palm-map__line--on" : ""
                        }`}
                        d={geo.forkD[line.length]}
                        stroke={`url(#${uid}-line)`}
                        filter={active ? `url(#${uid}-line-glow)` : undefined}
                        aria-hidden="true"
                      />
                    ) : null}
                    <path
                      className="palm-map__line-hit"
                      d={geo.d}
                      role="button"
                      tabIndex={0}
                      aria-label={`${PALM_LINE_NAMES[line.key]}: ${state}`}
                      aria-pressed={active}
                      onClick={() => setSelected(line.key)}
                      onKeyDown={(event) => selectFromKey(event, line.key)}
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      <div className="palm-map__chips" aria-label="Линии и холмы ладони">
        <button
          type="button"
          aria-pressed={selected === "shape"}
          className={`palm-map__chip${selected === "shape" ? " palm-map__chip--on" : ""}`}
          onClick={() => setSelected("shape")}
        >
          Форма
        </button>
        {lines.map((line) => (
          <button
            key={line.key}
            type="button"
            aria-pressed={selected === line.key}
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
              aria-pressed={selected === mount.key}
              className={`palm-map__chip${selected === mount.key ? " palm-map__chip--on" : ""}`}
              onClick={() => setSelected(mount.key)}
            >
              {PALM_MOUNT_NAMES[mount.key].replace("Холм ", "")}
            </button>
          ))}
      </div>

      <article className="palm-map__explain" role="status" aria-live="polite">
        <p className="palm-map__explain-kicker">Выбрано на карте</p>
        <h3>{title}</h3>
        <p>{summary}</p>
        {detail.trim() ? <p>{detail.trim()}</p> : null}
      </article>
    </figure>
  );
}
