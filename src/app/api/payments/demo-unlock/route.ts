import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getSession, unlockSingleSession, unlockSubscription } from "@/lib/session";
import { getAuth } from "@/lib/auth";
import { isYukassaConfigured } from "@/lib/yukassa";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const auth = await getAuth();
  if (!auth || auth.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  if (isYukassaConfigured()) {
    return NextResponse.json({ error: "Demo only when YUKASSA not configured" }, { status: 403 });
  }

  try {
    const { sessionId, plan } = await request.json();
    if (!(await ensureDb()) || !sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Invalid" }, { status: 400 });
    }

    const session = await getSession(sessionId);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (plan === "subscription") {
      await unlockSubscription(sessionId);
    } else {
      await unlockSingleSession(sessionId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Demo unlock error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
