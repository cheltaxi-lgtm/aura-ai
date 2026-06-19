import { NextResponse } from "next/server";
import { getRuneSettings, serializeRuneConfig } from "@/lib/rune-settings";

export async function GET() {
  const settings = await getRuneSettings();
  return NextResponse.json(serializeRuneConfig(settings));
}
