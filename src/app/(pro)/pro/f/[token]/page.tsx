import type { Metadata } from "next";
import { requireProPage } from "@/modules/pro/gate";
import ProStub from "@/modules/pro/ui/ProStub";

export const metadata: Metadata = {
  title: "Анкета",
  robots: { index: false, follow: false },
};

export default function ProIntakePage() {
  requireProPage();
  return <ProStub title="Анкета-бриф" />;
}
