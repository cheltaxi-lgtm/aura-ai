"use client";

import { useMemo } from "react";
import type { AuraSnapshot } from "@/lib/aura-constants";

type AuraHaloProps = {
  /** Teaser subset is enough — only the palette is used. */
  snapshot: Pick<AuraSnapshot, "dominantColor" | "secondaryColors">;
  /** Object URL of the in-memory photo. When absent, an abstract plate is shown. */
  photoUrl?: string | null;
  /** Blur the photo (teaser state before payment). */
  veiled?: boolean;
};

function cssVarColors(snapshot: AuraHaloProps["snapshot"]): Record<string, string> {
  const c1 = snapshot.dominantColor.hex;
  const c2 = snapshot.secondaryColors[0]?.hex ?? snapshot.dominantColor.hex;
  const c3 = snapshot.secondaryColors[1]?.hex ?? c2;
  return {
    "--aura-c1": c1,
    "--aura-c2": c2,
    "--aura-c3": c3,
  } as Record<string, string>;
}

/**
 * Portrait with the aura halo in snapshot colors. The photo never leaves the
 * device — only the structured snapshot came from the server.
 */
export default function AuraHalo({ snapshot, photoUrl, veiled = false }: AuraHaloProps) {
  const colors = useMemo(() => cssVarColors(snapshot), [snapshot]);

  return (
    <div className="aura-stage" style={colors}>
      <div className="aura-stage__halo" aria-hidden />
      <div className="aura-stage__halo aura-stage__halo--outer" aria-hidden />
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="Ваш портрет с аурой"
          className={`aura-stage__photo${veiled ? " aura-stage__photo--veiled" : ""}`}
        />
      ) : (
        <div className="aura-stage__plate" role="img" aria-label="Пластина вашей ауры" />
      )}
    </div>
  );
}
