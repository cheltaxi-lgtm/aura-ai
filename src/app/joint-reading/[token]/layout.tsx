import type { Metadata } from "next";

/** Invite tokens must not enter organic index. */
export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function JointReadingTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
