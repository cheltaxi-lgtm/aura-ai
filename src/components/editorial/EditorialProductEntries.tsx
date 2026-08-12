"use client";

import Link from "next/link";
import { EDITORIAL_PRODUCT_ENTRIES } from "@/lib/editorial-landing-content";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

type EditorialProductEntriesProps = {
  /** Guest Tarot must stay inline (no auth gate). */
  onTarotCta: () => void;
};

/**
 * Compact multiproduct map under the hero — not four full marketing blocks.
 */
export default function EditorialProductEntries({ onTarotCta }: EditorialProductEntriesProps) {
  const { humanDesignEnabled } = usePlatformFeatures();

  return (
    <section
      className="editorial-product-entries"
      aria-label="Направления Zovus"
    >
      <div className="editorial-landing__inner">
        <p className="editorial-product-entries__kicker">Четыре направления</p>
        <ul className="editorial-product-entries__grid">
          {EDITORIAL_PRODUCT_ENTRIES.map((entry) => {
            const hdHidden = entry.id === "hd" && !humanDesignEnabled;
            if (hdHidden) return null;

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
                <Link href={entry.href} className="editorial-product-entry">
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
