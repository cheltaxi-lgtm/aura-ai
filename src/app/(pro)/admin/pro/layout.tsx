import type { Metadata } from "next";
import { requireProPage } from "@/modules/pro/gate";

export const metadata: Metadata = {
  title: "Admin · Pro",
  robots: { index: false, follow: false },
};

export default function AdminProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  requireProPage();
  return children;
}
