"use client";

import { useEffect } from "react";

/** Mark the app shell as active when the cabinet mounts — not before navigation. */
export default function CabinetAppShellMarker() {
  useEffect(() => {
    document.documentElement.dataset.appShell = "android";
  }, []);
  return null;
}
