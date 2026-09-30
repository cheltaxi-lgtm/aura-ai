"use client";

import Link from "next/link";
import { EDITORIAL_PRODUCT_ENTRIES, EDITORIAL_SECTION_IDS } from "@/lib/editorial-landing-content";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import { trackProductFunnel } from "@/lib/seo/product-funnel";

type EditorialProductEntriesProps = {
  /** Guest Tarot must stay inline (no auth gate). */
  onTarotCta: () => void;
};

/**
 * Compact multiproduct map under the hero — not four full marketing blocks.
 */
export default function EditorialProductEntries({ onTarotCta }: EditorialProductEntriesProps) {
  const { humanDesignEnabled, auraReadingEnabled, palmReadingEnabled, photoReadingEnabled, jointReadingEnabled } = usePlatformFeatures();

  return (
    <section
      id={EDITORIAL_SECTION_IDS.practices}
      className="editorial-product-entries scroll-mt-24"
      aria-labelledby="editorial-product-entries-title"
    >
      <div className="editorial-landing__inner">
        <p className="editorial-product-entries__kicker">Направления Zovus</p>
        <h2 id="editorial-product-entries-title" className="editorial-product-entries__heading">Выберите свой способ взглянуть на ситуацию</h2>
        <ul className="editorial-product-entries__grid">
          {EDITORIAL_PRODUCT_ENTRIES.map((entry) => {
            const hdHidden = entry.id === "hd" && !humanDesignEnabled;
            const auraHidden = entry.id === "aura" && !auraReadingEnabled;
            const palmHidden = entry.id === "palm" && !palmReadingEnabled;
            const photoHidden = entry.id === "photo" && !photoReadingEnabled;
            const jointHidden = entry.id === "joint" && !jointReadingEnabled;
            if (hdHidden || auraHidden || palmHidden || photoHidden || jointHidden) return null;

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
                <Link
                  href={entry.href}
                  prefetch={false}
                  className="editorial-product-entry"
                  onClick={entry.id === "aura" || entry.id === "palm"
                    ? () => trackProductFunnel("product_view", { product: entry.id, source: "home_banner" })
                    : undefined}
                >
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
