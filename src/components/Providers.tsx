"use client";

import AppShellBridge from "@/components/AppShellBridge";
import AppShellErrorBoundary from "@/components/AppShellErrorBoundary";
import AppMotionConfig from "@/components/AppMotionConfig";
import { PaywallProvider } from "@/contexts/PaywallContext";
import { ShareProvider } from "@/contexts/ShareContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PaywallProvider>
      <ShareProvider>
        <AppMotionConfig>
          <AppShellErrorBoundary>
            <AppShellBridge />
          </AppShellErrorBoundary>
          {children}
        </AppMotionConfig>
      </ShareProvider>
    </PaywallProvider>
  );
}
