"use client";

import AdminShell, { AdminTitle } from "@/components/admin/AdminShell";
import AdsAdminNav from "./AdsAdminNav";

export default function AdsDisabled() {
  return (
    <AdminShell>
      <AdminTitle title="Реклама" subtitle="Ads Autopilot" />
      <AdsAdminNav />
      <div className="glass-panel p-8 text-center">
        <p className="font-display text-xl text-aura-gold">Модуль выключен</p>
        <p className="mt-2 text-sm text-gray-500">
          Включите <code className="text-gray-400">ads.enabled</code> в настройках модуля.
        </p>
      </div>
    </AdminShell>
  );
}
