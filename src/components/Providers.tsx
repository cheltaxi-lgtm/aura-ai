"use client";

import { PaywallProvider } from "@/contexts/PaywallContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <PaywallProvider>{children}</PaywallProvider>;
}
