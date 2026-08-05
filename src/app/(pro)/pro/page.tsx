import type { Metadata } from "next";
import { requireProPage } from "@/modules/pro/gate";
import ProStub from "@/modules/pro/ui/ProStub";

export const metadata: Metadata = {
  title: "Zovus Pro",
  robots: { index: false, follow: false },
};

export default function ProHomePage() {
  requireProPage();
  return <ProStub title="Кабинет практика" />;
}
