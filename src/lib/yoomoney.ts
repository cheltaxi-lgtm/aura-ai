import crypto from "crypto";

export type PaymentPlan = "single" | "subscription";

const PLANS: Record<PaymentPlan, { amount: string; description: string }> = {
  single: { amount: "199.00", description: "Aura — детальный разбор" },
  subscription: { amount: "590.00", description: "Aura — подписка Aura+ на месяц" },
};

export function isYoomoneyConfigured(): boolean {
  const wallet = process.env.YOOMONEY_WALLET_NUMBER;
  const secret = process.env.YOOMONEY_SECRET_NOTIFICATION_KEY;
  return Boolean(wallet && secret && !wallet.startsWith("your-"));
}

export function createYoomoneyPaymentUrl(params: {
  plan: PaymentPlan;
  sessionId: string;
  returnUrl?: string;
}): { confirmationUrl: string; orderId: string; amount: number } {
  const wallet = process.env.YOOMONEY_WALLET_NUMBER;
  if (!wallet) throw new Error("YOOMONEY_WALLET_NUMBER not configured");

  const plan = PLANS[params.plan];
  const orderId = `aura_${params.sessionId.slice(0, 8)}_${params.plan}_${Date.now()}`;
  const label = `${params.sessionId}|${params.plan}|${orderId}`;

  const qs = new URLSearchParams({
    receiver: wallet,
    "quickpay-form": "shop",
    targets: plan.description,
    paymentType: "SB",
    sum: plan.amount,
    label,
  });

  if (params.returnUrl) {
    qs.set("successURL", params.returnUrl);
  }

  return {
    confirmationUrl: `https://yoomoney.ru/quickpay/confirm.xml?${qs.toString()}`,
    orderId,
    amount: parseFloat(plan.amount),
  };
}

export interface YoomoneyNotification {
  notification_type: string;
  operation_id: string;
  amount: string;
  currency: string;
  datetime: string;
  sender: string;
  codepro: string;
  label: string;
  sha1_hash: string;
  unaccepted?: string;
}

export function verifyYoomoneyNotification(data: YoomoneyNotification): boolean {
  const secret = process.env.YOOMONEY_SECRET_NOTIFICATION_KEY;
  if (!secret) return false;

  const payload = [
    data.notification_type,
    data.operation_id,
    data.amount,
    data.currency,
    data.datetime,
    data.sender,
    data.codepro,
    secret,
    data.label,
  ].join("&");

  const hash = crypto.createHash("sha1").update(payload).digest("hex");
  return hash === data.sha1_hash;
}

export function parseYoomoneyLabel(label: string): { sessionId: string; plan: PaymentPlan } | null {
  const parts = label.split("|");
  if (parts.length < 2) return null;
  const sessionId = parts[0];
  const plan = parts[1] as PaymentPlan;
  if (!sessionId || (plan !== "single" && plan !== "subscription")) return null;
  return { sessionId, plan };
}
