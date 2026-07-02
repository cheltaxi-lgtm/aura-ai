import { NextResponse } from "next/server";
import { readAndroidReleaseConfig } from "@/lib/android-release";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readAndroidReleaseConfig(), {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}
