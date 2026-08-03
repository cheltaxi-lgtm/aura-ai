import { NextResponse } from "next/server";
import { getRitualSettings } from "@/lib/ritual-settings";

export async function GET() {
  const settings = await getRitualSettings();
  return NextResponse.json({
    enabled: settings.enabled !== false,
    types: settings.types,
  });
}
