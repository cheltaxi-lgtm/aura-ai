import { getAppUrl } from "@/lib/brand";
import { NextRequest, NextResponse } from "next/server";
import { createYukassaPayment, isYukassaConfigured, getLegacyPrices, type PaymentPlan } from "@/lib/yukassa";
import { createYoomoneyPaymentUrl, isYoomoneyConfigured } from "@/lib/yoomoney";
import { recordPayment, getBloggerBySlug } from "@/lib/session";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { resolveSessionForUser } from "@/lib/session-access";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json({ error: "auth_required" }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId, plan, recaptchaToken } = body as {
      sessionId?: string;
      plan?: PaymentPlan;
      recaptchaToken?: string;
    };

    const captchaBlock = await enforceRecaptchaScope("payments", recaptchaToken, request);
    if (captchaBlock) return captchaBlock;

    if (!sessionId || !plan || !["single", "subscription"].includes(plan)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
    }

    const profileUserId = await getProfileUserIdForAccount(auth.sub);
    const resolved = await resolveSessionForUser(sessionId, profileUserId);
    if (resolved.error) return resolved.error;
    const session = resolved.session;
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const appUrl = getAppUrl();
    const returnUrl = `${appUrl}/?paid=1&session=${sessionId}`;

    let bloggerSplit: number | undefined;
    if (session.referrer_slug) {
      const blogger = await getBloggerBySlug(session.referrer_slug);
      bloggerSplit = blogger?.split_percent;
    }

    if (isYukassaConfigured()) {
      const payment = await createYukassaPayment({ plan, sessionId, returnUrl });
      const prices = await getLegacyPrices();
      const amount = plan === "single" ? prices.single : prices.subscription;

      await recordPayment({
        sessionId,
        orderId: payment.id,
        yukassaPaymentId: payment.id,
        amount,
        paymentType: plan,
        referrerSlug: session.referrer_slug ?? undefined,
        bloggerSplitPercent: bloggerSplit,
      });

      return NextResponse.json({
        provider: "yukassa",
        paymentId: payment.id,
        confirmationUrl: payment.confirmation?.confirmation_url,
      });
    }

    if (isYoomoneyConfigured()) {
      const payment = await createYoomoneyPaymentUrl({ plan, sessionId, returnUrl });

      await recordPayment({
        sessionId,
        orderId: payment.orderId,
        amount: payment.amount,
        paymentType: plan,
        referrerSlug: session.referrer_slug ?? undefined,
        bloggerSplitPercent: bloggerSplit,
      });

      return NextResponse.json({
        provider: "yoomoney",
        orderId: payment.orderId,
        confirmationUrl: payment.confirmationUrl,
      });
    }

    return NextResponse.json({
      demo: true,
      confirmationUrl: `${returnUrl}&demo=${plan}`,
      message: "Платёжная система не настроена — демо-режим",
    });
  } catch (error) {
    console.error("Payment create error:", error);
    return NextResponse.json({ error: "Payment failed" }, { status: 500 });
  }
}
