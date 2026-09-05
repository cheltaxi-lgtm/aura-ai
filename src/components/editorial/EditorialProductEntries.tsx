"use client";

import Link from "next/link";
import { EDITORIAL_PRODUCT_ENTRIES, EDITORIAL_SECTION_IDS } from "@/lib/editorial-landing-content";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

type EditorialProductEntriesProps = {
  /** Guest Tarot must stay inline (no auth gate). */
  onTarotCta: () => void;
};

/**
 * Compact multiproduct map under the hero — not four full marketing blocks.
 */
export default function EditorialProductEntries({ onTarotCta }: EditorialProductEntriesProps) {
  const { humanDesignEnabled, auraReadingEnabled, palmReadingEnabled } = usePlatformFeatures();

  return (
    <section
      id={EDITORIAL_SECTION_IDS.practices}
      className="editorial-product-entries scroll-mt-24"
      aria-label="Направления Zovus"
    >
      <div className="editorial-landing__inner">
        <p className="editorial-product-entries__kicker">Направления Zovus</p>
        <ul className="editorial-product-entries__grid">
          {EDITORIAL_PRODUCT_ENTRIES.map((entry) => {
            const hdHidden = entry.id === "hd" && !humanDesignEnabled;
            const auraHidden = entry.id === "aura" && !auraReadingEnabled;
            const palmHidden = entry.id === "palm" && !palmReadingEnabled;
            if (hdHidden || auraHidden || palmHidden) return null;

            if (entry.kind === "action") {
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="editorial-product-entry"
                    onClick={onTarotCta}
                  >
                    <span className="editorial-product-entry__title">{entry.title}</span>
                    <span className="editorial-product-entry__text">{entry.text}</span>
                    <span className="editorial-product-entry__cta">{entry.cta}</span>
                  </button>
                </li>
              );
            }

            return (
              <li key={entry.id}>
                <Link href={entry.href} prefetch={false} className="editorial-product-entry">
                  <span className="editorial-product-entry__title">{entry.title}</span>
                  <span className="editorial-product-entry__text">{entry.text}</span>
                  <span className="editorial-product-entry__cta">{entry.cta}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
