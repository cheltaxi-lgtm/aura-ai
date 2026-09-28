"use client";

import { useEffect } from "react";
import { captureUtmFromLocation } from "@/lib/utm/attribution";

/** Captures the first landing path and campaign tags before registration. */
export default function UtmCapture() {
  useEffect(() => {
    captureUtmFromLocation();
  }, []);

  return null;
}
