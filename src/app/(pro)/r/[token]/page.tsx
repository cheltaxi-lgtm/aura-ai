import type { Metadata } from "next";
import { requireProPage } from "@/modules/pro/gate";
import ProStub from "@/modules/pro/ui/ProStub";

export const metadata: Metadata = {
  title: "Отчёт",
  robots: { index: false, follow: false },
};

export default function ProDeliveryPage() {
  requireProPage();
  return <ProStub title="Отчёт" />;
}
