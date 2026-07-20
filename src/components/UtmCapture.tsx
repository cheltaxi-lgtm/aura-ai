"use client";

import { useEffect } from "react";
import { captureUtmFromLocation } from "@/lib/utm/attribution";

/** Captures first-touch UTM / click ids on every page load. */
export default function UtmCapture() {
  useEffect(() => {
    captureUtmFromLocation();
  }, []);

  return null;
}
