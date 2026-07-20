import type { Metadata } from "next";
import CabinetAgeGate from "@/components/cabinet/CabinetAgeGate";
import CabinetAppShellMarker from "./CabinetAppShellMarker";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CabinetAppShellMarker />
      <CabinetAgeGate>{children}</CabinetAgeGate>
    </>
  );
}
