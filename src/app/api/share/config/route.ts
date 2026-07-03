import { NextResponse } from "next/server";
import { getShareSettings, isShareEnabled } from "@/lib/share";

export async function GET() {
  const enabled = await isShareEnabled();
  const settings = await getShareSettings();
  return NextResponse.json({
    enabled,
    channels: settings.channels,
  });
}
