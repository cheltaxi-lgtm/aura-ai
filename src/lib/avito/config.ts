export function isAvitoEnabled(): boolean {
  return process.env.AVITO_ENABLED === "true";
}

export function isAvitoConfigured(): boolean {
  const clientId = process.env.AVITO_CLIENT_ID;
  const clientSecret = process.env.AVITO_CLIENT_SECRET;
  return Boolean(clientId && clientSecret && !clientId.startsWith("your-"));
}

export function getAvitoWebhookSecret(): string | null {
  const secret = process.env.AVITO_WEBHOOK_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}
