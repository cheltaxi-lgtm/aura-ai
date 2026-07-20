import { NextResponse } from "next/server";

import { recordAccountLegalConsent } from "@/lib/accounts";
import { setAgeGateCookie } from "@/lib/age-gate-cookie";
import { getAuth } from "@/lib/auth";
import { ensureDb } from "@/lib/db";

export async function POST() {
  try {
    await setAgeGateCookie();

    const auth = await getAuth();
    if (auth?.role === "user") {
      if (!(await ensureDb())) {
        return NextResponse.json(
          { error: "Сервис временно недоступен. Попробуйте позже." },
          { status: 503 }
        );
      }
      await recordAccountLegalConsent(auth.sub, {
        ageConfirmed: true,
        acceptedTerms: true,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Age gate confirm error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
