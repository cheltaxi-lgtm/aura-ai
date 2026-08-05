import type { Metadata } from "next";
import { requireProPage } from "@/modules/pro/gate";

export const metadata: Metadata = {
  title: "Zovus Pro",
  robots: { index: false, follow: false },
};

export default function ProLayout({ children }: { children: React.ReactNode }) {
  requireProPage();
  return children;
}
