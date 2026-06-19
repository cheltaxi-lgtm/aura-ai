const YUKASSA_API = "https://api.yookassa.ru/v3";

export type PaymentPlan = "single" | "subscription";

const PLANS: Record<PaymentPlan, { amount: string; description: string }> = {
  single: { amount: "199.00", description: "Aura — детальный разбор" },
  subscription: { amount: "590.00", description: "Aura — подписка на месяц" },
};

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
  const plan = PLANS[params.plan];
  const idempotenceKey = `${params.sessionId}-${params.plan}-${Date.now()}`;

  const response = await fetch(`${YUKASSA_API}/payments`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: plan.amount, currency: "RUB" },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: params.returnUrl,
      },
      description: plan.description,
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
      description: `AuraAI — ${params.packageName}: ${params.totalRunes} ᚢ рун`,
      metadata: {
        userId: params.userId,
        packageId: params.packageId,
        runesAmount: String(params.totalRunes),
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

/** Verify webhook payload against YooKassa API (status must be succeeded). */
export async function verifyYukassaWebhookPayment(
  paymentId: string,
  event?: string
): Promise<{ valid: boolean; metadata?: Record<string, string> }> {
  if (event && event !== "payment.succeeded") {
    return { valid: false };
  }
  const payment = await fetchYukassaPayment(paymentId);
  if (!payment || payment.status !== "succeeded") {
    return { valid: false };
  }
  return { valid: true, metadata: payment.metadata };
}
