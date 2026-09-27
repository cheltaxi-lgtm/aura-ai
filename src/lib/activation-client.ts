type Product = "tarot" | "daily" | "aura" | "palm";
/** No arbitrary metadata, identities, artifact ids, questions or report text. */
export function trackActivation(product: Product, event: "offer_shown" | "offer_clicked" | "network_failed", key?: string): void {
  try {
    const eventKey=key ?? globalThis.crypto?.randomUUID?.();
    if (!eventKey) return;
    void fetch("/api/auth/activation", { method: "POST", credentials: "include", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({product,event,key:eventKey}) }).catch(()=>undefined);
  } catch { /* Optional analytics cannot interrupt a product action. */ }
}
