"use client";

import AppShellServiceWorker from "@/components/AppShellServiceWorker";
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
            <AppShellServiceWorker />
            <AppShellBridge />
          </AppShellErrorBoundary>
          {children}
        </AppMotionConfig>
      </ShareProvider>
    </PaywallProvider>
  );
}
