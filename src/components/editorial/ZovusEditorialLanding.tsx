"use client";

import AuraSellingLanding, { type AuraSellingLandingProps } from "@/components/AuraSellingLanding";

export type ZovusEditorialLandingProps = Omit<AuraSellingLandingProps, "layout">;

/** Editorial shell — 100% AuraSellingLanding functionality, mockup visual sections. */
export default function ZovusEditorialLanding(props: ZovusEditorialLandingProps) {
  return <AuraSellingLanding {...props} layout="editorial" />;
}
