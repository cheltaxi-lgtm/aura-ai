import { getSetting } from "@/lib/settings";

const YUKASSA_API = "https://api.yookassa.ru/v3";

export type PaymentPlan = "single" | "subscription";

const PLAN_DESCRIPTIONS: Record<PaymentPlan, string> = {
  single: "Zovus — детальный разбор",
  subscription: "Zovus — подписка на месяц",
};

export async function getLegacyPrices(): Promise<{
  single: number;
  subscription: number;
  currency: string;
}> {
  const pricing = await getSetting("pricing");
  return {
    single: pricing.singlePrice ?? 199,
    subscription: pricing.subscriptionPrice ?? 590,
    currency: pricing.currency ?? "RUB",
  };
}

function authHeader(): string {
  const shopId = process.env.YUKASSA_SHOP_ID;
  const secret = process.env.YUKASSA_SECRET_KEY;
  if (!shopId || !secret || shopId.startsWith("your-")) {
    throw new Error("YUKASSA credentials not configured");
  }
  return "Basic " + Buffer.from(`${shopId}:${secret}`).toString("base64");
}

export async function createYukassaPayment(params: {
  plan: PaymentPlan;
  sessionId: string;
  returnUrl: string;
}) {
  const prices = await getLegacyPrices();
  const amountRub = params.plan === "single" ? prices.single : prices.subscription;
  const idempotenceKey = `${params.sessionId}-${params.plan}-${Date.now()}`;

  const response = await fetch(`${YUKASSA_API}/payments`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: amountRub.toFixed(2), currency: prices.currency },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: params.returnUrl,
      },
      description: PLAN_DESCRIPTIONS[params.plan],
      metadata: {
        session_id: params.sessionId,
        plan: params.plan,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`YooKassa error: ${err}`);
  }

  return response.json() as Promise<{
    id: string;
    status: string;
    confirmation?: { confirmation_url?: string };
  }>;
}

export function isYukassaConfigured(): boolean {
  const shopId = process.env.YUKASSA_SHOP_ID;
  const secret = process.env.YUKASSA_SECRET_KEY;
  return Boolean(shopId && secret && !shopId.startsWith("your-"));
}

export async function createYukassaRunePayment(params: {
  packageId: string;
  packageName: string;
  priceRub: number;
  totalRunes: number;
  userId: string;
  returnUrl: string;
}) {
  const idempotenceKey = `rune-${params.userId}-${params.packageId}-${Date.now()}`;

  const response = await fetch(`${YUKASSA_API}/payments`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: params.priceRub.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: params.returnUrl,
      },
      description: `Zovus — ${params.packageName}: ${params.totalRunes} ᚢ рун`,
      metadata: {
        userId: params.userId,
        packageId: params.packageId,
        packageName: params.packageName,
        runesAmount: String(params.totalRunes),
        runes_count: String(params.totalRunes),
        type: "rune_purchase",
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`YooKassa error: ${err}`);
  }

  return response.json() as Promise<{
    id: string;
    status: string;
    confirmation?: { confirmation_url?: string };
  }>;
}

export async function fetchYukassaPayment(paymentId: string): Promise<{
  id: string;
  status: string;
  amount?: { value: string; currency: string };
  metadata?: Record<string, string>;
} | null> {
  if (!isYukassaConfigured()) return null;

  try {
    const response = await fetch(`${YUKASSA_API}/payments/${paymentId}`, {
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export async function listRecentYukassaPayments(sinceIso: string, limit = 20): Promise<
  Array<{
    id: string;
    status: string;
    amount?: { value: string; currency: string };
    metadata?: Record<string, string>;
    created_at?: string;
  }>
> {
  if (!isYukassaConfigured()) return [];

  try {
    const response = await fetch(
      `${YUKASSA_API}/payments?created_at.gte=${encodeURIComponent(sinceIso)}&limit=${limit}`,
      {
        headers: {
          Authorization: authHeader(),
          "Content-Type": "application/json",
        },
      }
    );
    if (!response.ok) return [];
    const data = (await response.json()) as { items?: Array<Record<string, unknown>> };
    return (data.items ?? []) as Array<{
      id: string;
      status: string;
      amount?: { value: string; currency: string };
      metadata?: Record<string, string>;
      created_at?: string;
    }>;
  } catch {
    return [];
  }
}

/** Verify webhook payload against YooKassa API (status must be succeeded). */
export async function verifyYukassaWebhookPayment(
  paymentId: string,
  event?: string
): Promise<{ valid: boolean; metadata?: Record<string, string>; amountRub?: number }> {
  if (event && event !== "payment.succeeded") {
    return { valid: false };
  }
  const payment = await fetchYukassaPayment(paymentId);
  if (!payment || payment.status !== "succeeded") {
    return { valid: false };
  }
  const amountRub = payment.amount?.value ? Number(payment.amount.value) : undefined;
  return {
    valid: true,
    metadata: payment.metadata,
    amountRub: Number.isFinite(amountRub) ? amountRub : undefined,
  };
}
