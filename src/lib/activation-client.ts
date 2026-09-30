type Product = "tarot" | "daily" | "aura" | "palm";
type Surface = "post_result" | "personal_home" | "cabinet";
declare const activationEventKeyBrand: unique symbol;
export type ActivationEventKey = string & { readonly [activationEventKeyBrand]: true };

/** An opaque key for one mounted offer; never use a reading, report or session ID. */
export function createActivationEventKey(): ActivationEventKey | undefined {
  return globalThis.crypto?.randomUUID?.() as ActivationEventKey | undefined;
}
/** No arbitrary metadata, identities, artifact ids, questions or report text. */
export function trackActivation(product: Product, event: "offer_shown" | "offer_clicked" | "network_failed", key?: ActivationEventKey, surface?: Surface): void {
  try {
    const eventKey=key ?? createActivationEventKey();
    if (!eventKey) return;
    void fetch("/api/auth/activation", { method: "POST", credentials: "include", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({product,event,key:eventKey,...(surface?{surface}:{})}) }).catch(()=>undefined);
  } catch { /* Optional analytics cannot interrupt a product action. */ }
}
