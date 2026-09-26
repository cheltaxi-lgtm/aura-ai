import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

/** Client-side helpers for YooKassa rune purchase redirect + success-page confirm. */

export const RUNE_BALANCE_BEFORE_KEY = "aura_runes_before_purchase";
export const RUNE_PENDING_PAYMENT_KEY = "aura_pending_rune_payment_id";
const RUNE_GOAL_FIRED_PREFIX = "aura_rune_goal_fired_";
const RUNE_DESTINATION_KEY = "aura_rune_purchase_destination";
export function runeShopDestination(packageId?: string): string {
  const params = new URLSearchParams({ shop: "1" });
  if (packageId && /^[a-zA-Z0-9_-]{1,64}$/.test(packageId)) params.set("package", packageId);
  return `/cabinet?${params}`;
}
/** Stable through transport retries. A different package is a different explicit choice. */
export function runePurchaseAttempt(selection: string): string {
  const key=`aura_rune_attempt:${selection}`;
  try {const previous=JSON.parse(sessionStorage.getItem(key)??"null");if(previous && Date.now()-previous.at<3_600_000 && typeof previous.id==="string"){sessionStorage.setItem("aura_rune_active_attempt",key);return previous.id;}
    const id=crypto.randomUUID();sessionStorage.setItem(key,JSON.stringify({id,at:Date.now()}));sessionStorage.setItem("aura_rune_active_attempt",key);return id;
  }catch{return crypto.randomUUID();}
}
/** A terminal external checkout must allow a new explicit purchase.
 * Ambiguous/pending outcomes retain the same provider idempotency key. */
export async function prepareRunePurchaseAttempt(selection:string):Promise<string> {
  const id=runePurchaseAttempt(selection);
  try{
    const attempt=JSON.parse(sessionStorage.getItem(`aura_rune_attempt:${selection}`)??"null");
    if(!attempt?.paymentId)return id;
    const response=await fetchWithTimeout("/api/runes/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({paymentId:attempt.paymentId}),timeoutMs:8000});
    const data=await response.json();
    if(response.ok && ["cancelled","credited","already_credited"].includes(data.status)){clearPendingRunePurchase(attempt.paymentId,id);return runePurchaseAttempt(selection);}
  }catch{/* Retain the key after network failure; never assume a cancellation. */}
  return id;
}
const SAFE_DESTINATIONS = ["/aura","/gadanie-po-ladoni","/natalnaya-karta","/numerology/destiny-matrix","/numerology/matrica-sovmestimosti","/dizayn-cheloveka/rasschitat","/cabinet","/cabinet/astrology","/cabinet/human-design"];
function purchaseDestination(raw:string):string {
  try {
    const url=new URL(raw,"https://zovus.ru");
    if(url.origin!=="https://zovus.ru")return "/cabinet";
    if(url.pathname==="/" && url.searchParams.get("photo")==="1")return "/?photo=1";
    if(!SAFE_DESTINATIONS.includes(url.pathname))return "/cabinet";
    const params=new URLSearchParams();
    for(const key of ["tab","tradition","chartId","reportId","snapshotId","reading","subject"]){const value=url.searchParams.get(key);if(value && /^[a-zA-Z0-9_-]{1,80}$/.test(value))params.set(key,value);}
    return url.pathname+(params.size?`?${params}`:"");
  }catch{return "/cabinet";}
}
export function readRunePurchaseDestination(paymentId?:string|null): string {
  try { const value=JSON.parse(localStorage.getItem(paymentId?`${RUNE_DESTINATION_KEY}:${paymentId}`:RUNE_DESTINATION_KEY)??"null");
    return value && Date.now()-value.at<86_400_000 && typeof value.path==="string"?purchaseDestination(value.path):"/cabinet";
  }catch{return "/cabinet";}
}

export function rememberRunePurchaseDestination(raw?:string,requiredRunes?:number): void {
  try { sessionStorage.setItem("aura_rune_selected_destination",JSON.stringify({path:purchaseDestination(raw ?? window.location.pathname+window.location.search),requiredRunes,at:Date.now()})); }catch{/* storage unavailable */}
}

/** Display-only quote; generation endpoints always validate their own current price. */
export function readSelectedRuneCost(): number | undefined {
  try{const selected=JSON.parse(sessionStorage.getItem("aura_rune_selected_destination")??"null");return selected && Date.now()-selected.at<900_000 && Number.isSafeInteger(selected.requiredRunes) && selected.requiredRunes>0 ? selected.requiredRunes : undefined;}catch{return undefined;}
}

export function storePendingRunePurchase(paymentId: string, balanceBefore: number): void {
  if (typeof window === "undefined") return;
  try {
    const selected=JSON.parse(sessionStorage.getItem("aura_rune_selected_destination")??"null");
    const fromShop=window.location.pathname==="/tariffs" || window.location.pathname==="/cabinet";
    const path=fromShop && selected && Date.now()-selected.at<900_000 ? purchaseDestination(selected.path) : purchaseDestination(window.location.pathname+window.location.search);
    const destination=JSON.stringify({path,at:Date.now()});
    localStorage.setItem(RUNE_DESTINATION_KEY,destination);
    if(paymentId)localStorage.setItem(`${RUNE_DESTINATION_KEY}:${paymentId}`,destination);
    sessionStorage.removeItem("aura_rune_selected_destination");
    localStorage.setItem(RUNE_BALANCE_BEFORE_KEY, String(balanceBefore));
    if (paymentId) {
      localStorage.setItem(RUNE_PENDING_PAYMENT_KEY, paymentId);
      const attemptKey=sessionStorage.getItem("aura_rune_active_attempt");
      if(attemptKey){const attempt=JSON.parse(sessionStorage.getItem(attemptKey)??"null");if(attempt)sessionStorage.setItem(attemptKey,JSON.stringify({...attempt,paymentId}));}
    }
  } catch {
    /* private mode / quota */
  }
}

export function readPendingRunePaymentId(searchParams?: URLSearchParams): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = searchParams?.get("paymentId")?.trim();
  if (fromUrl) {
    try {
      localStorage.setItem(RUNE_PENDING_PAYMENT_KEY, fromUrl);
    } catch {
      /* ignore */
    }
    return fromUrl;
  }
  try {
    return localStorage.getItem(RUNE_PENDING_PAYMENT_KEY);
  } catch {
    return null;
  }
}

export function clearPendingRunePurchase(completedPaymentId?: string | null, completedOrderId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const pendingId=localStorage.getItem(RUNE_PENDING_PAYMENT_KEY);
    const paymentId=completedPaymentId ?? (completedOrderId ? null : pendingId);
    for(const key of Object.keys(sessionStorage)) {
      if(key.startsWith("aura_rune_attempt:")){
        try{const attempt=JSON.parse(sessionStorage.getItem(key)??"null");if((paymentId && attempt?.paymentId===paymentId) || (completedOrderId && attempt?.id===completedOrderId))sessionStorage.removeItem(key);}catch{/* malformed attempt */}
      }
    }
    if(paymentId && pendingId===paymentId){localStorage.removeItem(RUNE_BALANCE_BEFORE_KEY);localStorage.removeItem(RUNE_PENDING_PAYMENT_KEY);}
  } catch {
    /* ignore */
  }
}

/** Analytics goals fire once per payment even though the success page polls repeatedly. */
export function markRunePurchaseGoalFired(paymentId: string): void {
  if (typeof window === "undefined" || !paymentId) return;
  try {
    localStorage.setItem(`${RUNE_GOAL_FIRED_PREFIX}${paymentId}`, "1");
  } catch {
    /* ignore */
  }
}

export function hasFiredRunePurchaseGoal(paymentId: string): boolean {
  if (typeof window === "undefined" || !paymentId) return false;
  try {
    return localStorage.getItem(`${RUNE_GOAL_FIRED_PREFIX}${paymentId}`) === "1";
  } catch {
    return false;
  }
}

export function buildRunePurchaseReturnUrl(
  appUrl: string,
  paymentId?: string,
  orderId?: string
): string {
  const base = appUrl.replace(/\/$/, "");
  const params = new URLSearchParams();
  if (paymentId) params.set("paymentId", paymentId);
  if (orderId) params.set("orderId", orderId);
  const qs = params.toString();
  return qs ? `${base}/runes/success?${qs}` : `${base}/runes/success`;
}

export function readPendingRuneOrderId(searchParams?: URLSearchParams): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = searchParams?.get("orderId")?.trim();
  if (fromUrl) return fromUrl;
  return null;
}
