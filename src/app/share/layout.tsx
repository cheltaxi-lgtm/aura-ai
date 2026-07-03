import type { Metadata } from "next";

/** User-shared snapshots — not SEO landing pages. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
