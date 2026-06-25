import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

export async function GET() {
  const features = await getSetting("features");
  return NextResponse.json({
    expertRegistrationEnabled: features.expertRegistrationEnabled !== false,
  });
}
