import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function readFingerprints(): string[] {
  const raw =
    process.env.ANDROID_ASSETLINKS_SHA256?.trim() ||
    process.env.ANDROID_RELEASE_SHA256?.trim() ||
    "";
  const fromEnv = raw
    .split(/[,\s]+/)
    .map((part) => part.trim().replace(/:/g, "").toUpperCase())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "assetlinks.json: ANDROID_ASSETLINKS_SHA256 is unset — App Links verification will fail"
    );
  }
  return ["REPLACE_WITH_RELEASE_KEY_SHA256_FINGERPRINT"];
}

export async function GET() {
  const payload = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "ru.zovus.app",
        sha256_cert_fingerprints: readFingerprints(),
      },
    },
  ];

  return NextResponse.json(payload, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
