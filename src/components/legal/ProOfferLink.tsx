"use client";

import LegalDocLink from "@/components/legal/LegalDocLink";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

export default function ProOfferLink() {
  const { proModuleEnabled } = usePlatformFeatures();
  if (!proModuleEnabled) return null;
  return (
    <LegalDocLink href="/offer-pro" className="text-aura-ivory/50 hover:text-aura-champagne">
      Оферта Pro
    </LegalDocLink>
  );
}
