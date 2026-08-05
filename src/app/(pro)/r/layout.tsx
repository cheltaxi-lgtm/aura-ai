import type { Metadata } from "next";
import { requireProPage } from "@/modules/pro/gate";

export const metadata: Metadata = {
  title: "Отчёт",
  robots: { index: false, follow: false },
};

export default function ProReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  requireProPage();
  return children;
}
