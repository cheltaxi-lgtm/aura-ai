"use client";

import { PaywallProvider } from "@/contexts/PaywallContext";
import { ShareProvider } from "@/contexts/ShareContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PaywallProvider>
      <ShareProvider>{children}</ShareProvider>
    </PaywallProvider>
  );
}
