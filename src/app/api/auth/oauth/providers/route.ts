import { NextResponse } from "next/server";
import { listEnabledOAuthProviders } from "@/lib/oauth/config";

export async function GET() {
  return NextResponse.json({
    providers: listEnabledOAuthProviders(),
  });
}
