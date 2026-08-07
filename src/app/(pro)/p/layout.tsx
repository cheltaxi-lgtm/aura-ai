import type { Metadata } from "next";
import { requireProPortalPage } from "@/modules/pro/gate";

export const metadata: Metadata = {
  title: "Разбор карты",
  robots: { index: false, follow: false },
};

export default function ProLandingPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  requireProPortalPage();
  return children;
}
