import type { Metadata } from "next";
import { requireProPage } from "@/modules/pro/gate";
import ProStub from "@/modules/pro/ui/ProStub";

export const metadata: Metadata = {
  title: "Admin · Pro",
  robots: { index: false, follow: false },
};

export default function AdminProPage() {
  requireProPage();
  return <ProStub title="Админка Pro" />;
}
