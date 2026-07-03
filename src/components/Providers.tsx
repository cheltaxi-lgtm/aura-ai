"use client";

import AppShellBridge from "@/components/AppShellBridge";
import AppMotionConfig from "@/components/AppMotionConfig";
import { PaywallProvider } from "@/contexts/PaywallContext";
import { ShareProvider } from "@/contexts/ShareContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PaywallProvider>
      <ShareProvider>
        <AppMotionConfig>
          <AppShellBridge />
          {children}
        </AppMotionConfig>
      </ShareProvider>
    </PaywallProvider>
  );
}
