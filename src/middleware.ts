import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  fetchMaintenanceModeActive,
  isMaintenanceBypassPath,
  isSearchEngineBot,
  MAINTENANCE_BOT_RETRY_AFTER_SEC,
  MAINTENANCE_PAGE_PATH,
} from "@/lib/maintenance-mode";
import { isAuthenticatedNatalWorkerRequest } from "@/lib/async-job-worker-auth-shared";
import { LEGACY_CYRILLIC_REDIRECTS } from "@/lib/seo/legacy-cyrillic-redirects";

const COOKIE = "aura_auth";

type AuthRole = "user" | "expert" | "admin";

/** API routes reachable without a valid JWT (handlers may still enforce their own rules). */
const PUBLIC_API_EXACT = new Set([
  "/api/health",
  "/api/masters",
  "/api/platform/features",
  "/api/platform/status",
  "/api/runes/config",
  "/api/runes/packages",
  "/api/ritual/moon",
  "/api/ritual/stats",
  "/api/ritual/config",
  "/api/age-gate/confirm",
  "/api/session",
  "/api/guest-triplet/complete",
  "/api/guest-triplet/teaser",
  "/api/guest-triplet/status",
  "/api/guest-triplet/claim",
  "/api/guest-triplet/telegram-claim",
  "/api/debug/client-log",
  // Diagnostic breadcrumb only (camera/upload failures) — must not depend on
  // login state, otherwise failures from logged-out users vanish silently.
  "/api/photo-reading/client-log",
  "/api/influencer/register",
  "/api/intention-spread",
  "/api/payment/webhook",
  "/api/payments/webhook",
  "/api/runes/webhook",
  "/api/share",
  // Background jobs authenticate via x-cron-secret inside the route handler.
  "/api/ritual/remind",
  "/api/ritual/recover-stuck",
]);

const PUBLIC_API_PREFIXES = [
  "/api/auth/",
  "/api/app/",
  "/api/scene-art/",
  "/api/share/",
  // Public report shares use high-entropy, expiring, revocable tokens and enforce
  // rate limits in the handler. Keep this narrower than the /api/public namespace.
  "/api/public/reports/",
  "/api/cron/",
  // Ads Autopilot beacon (guest): click capture + micro-conversions only.
  // /api/ads/link stays auth-gated. Handlers return 404 when ads.enabled=false.
  "/api/ads/t",
  "/api/ads/e",
  // GET /api/joint-reading/[token] must be reachable by a guest partner who hasn't
  // logged in yet (the page shows a login gate) — create/complete/mine still enforce
  // their own requireProfileUserId() check inside the handler.
  "/api/joint-reading/",
] as const;

function resolveSecretKey(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret === "dev-secret-change-in-production") {
    if (process.env.NODE_ENV === "production") {
      return null;
    }
    return new TextEncoder().encode("dev-secret-change-in-production");
  }
  return new TextEncoder().encode(secret);
}

function isPublicApiRoute(pathname: string): boolean {
  if (PUBLIC_API_EXACT.has(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function loginPathForRole(role: AuthRole): string {
  if (role === "expert") return "/auth/expert/login";
  if (role === "admin") return "/admin/login";
  return "/auth/user/login";
}

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.startsWith("localhost:") ||
    h === "127.0.0.1" ||
    h.startsWith("127.0.0.1:") ||
    h === "[::1]" ||
    h.startsWith("[::1]:")
  );
}

/**
 * Public site origin for redirects. Next binds to 127.0.0.1:3000 behind Caddy,
 * so request.nextUrl / request.url are often http(s)://localhost:3000 — that
 * must never leak into Location headers (Capacitor then opens the system browser).
 */
function resolvePublicOrigin(request: NextRequest): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (env) {
    try {
      const u = new URL(env.includes("://") ? env : `https://${env}`);
      if (!isLoopbackHost(u.host)) return u.origin;
    } catch {
      /* fall through */
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim() || "";
  if (host && !isLoopbackHost(host)) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto =
      forwardedProto === "http" || forwardedProto === "https"
        ? forwardedProto
        : host.includes("zovus.ru")
          ? "https"
          : request.nextUrl.protocol.replace(":", "") || "https";
    return `${proto}://${host}`;
  }

  return "https://zovus.ru";
}

function publicUrl(request: NextRequest, pathname: string): URL {
  const url = new URL(pathname, `${resolvePublicOrigin(request)}/`);
  return url;
}

async function verifyRole(token: string, secretKey: Uint8Array): Promise<AuthRole | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    const role = payload.role as AuthRole;
    if (role === "user" || role === "expert" || role === "admin") return role;
    return null;
  } catch {
    return null;
  }
}

async function isAdminSession(request: NextRequest, secretKey: Uint8Array | null): Promise<boolean> {
  if (!secretKey) return false;
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return false;
  const role = await verifyRole(token, secretKey);
  return role === "admin";
}

function redirectToLogin(request: NextRequest, role: AuthRole) {
  const url = publicUrl(request, loginPathForRole(role));
  const app = request.nextUrl.searchParams.get("app");
  if (app) url.searchParams.set("app", app);
  url.searchParams.set("returnTo", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

function misconfiguredResponse(pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  return new NextResponse("Server misconfigured", { status: 500 });
}

function unauthorizedApiResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbiddenApiResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function maintenanceApiResponse() {
  return NextResponse.json(
    {
      error: "maintenance",
      maintenanceMode: true,
      message: "Сервис временно на обслуживании",
    },
    { status: 503, headers: { "Retry-After": String(MAINTENANCE_BOT_RETRY_AFTER_SEC) } }
  );
}

/** Bots must not follow a soft-redirect to /maintenance (Yandex drops URLs as noindex). */
function maintenanceBotHtmlResponse() {
  return withNoStore(
    new NextResponse(
      "<!doctype html><title>Service Unavailable</title><h1>Service temporarily unavailable</h1>",
      {
        status: 503,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Retry-After": String(MAINTENANCE_BOT_RETRY_AFTER_SEC),
        },
      }
    )
  );
}

function requiredApiRole(pathname: string): AuthRole | null {
  if (pathname.startsWith("/api/admin/")) return "admin";
  if (pathname.startsWith("/api/expert/")) return "expert";
  return null;
}

function isAdminAreaPath(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/admin/");
}

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

async function enforceMaintenanceMode(
  request: NextRequest,
  pathname: string,
  secretKey: Uint8Array | null
): Promise<NextResponse | null> {
  if (isMaintenanceBypassPath(pathname)) return null;

  const active = await fetchMaintenanceModeActive();
  const isAdmin = await isAdminSession(request, secretKey);
  const adminArea = isAdminAreaPath(pathname);

  if (!active) {
    if (pathname === MAINTENANCE_PAGE_PATH) {
      return withNoStore(NextResponse.redirect(publicUrl(request, "/")));
    }
    return null;
  }

  if (adminArea && isAdmin) return null;

  if (pathname.startsWith("/api/")) {
    return maintenanceApiResponse();
  }

  if (pathname !== MAINTENANCE_PAGE_PATH) {
    // Humans → friendly page. Crawlers → 503 (never 302 to noindex /maintenance).
    if (isSearchEngineBot(request.headers.get("user-agent"))) {
      return maintenanceBotHtmlResponse();
    }
    return withNoStore(NextResponse.redirect(publicUrl(request, MAINTENANCE_PAGE_PATH)));
  }

  return null;
}

function legacyCyrillicRedirect(request: NextRequest, pathname: string): NextResponse | null {
  // pathname may arrive either already-decoded or still percent-encoded
  // depending on how Next's router normalized it — try both forms.
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // malformed percent-encoding — fall through with the raw pathname
  }
  const target = LEGACY_CYRILLIC_REDIRECTS[decoded] ?? LEGACY_CYRILLIC_REDIRECTS[pathname];
  if (!target) return null;
  const url = publicUrl(request, target);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 308);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  const legacyRedirect = legacyCyrillicRedirect(request, pathname);
  if (legacyRedirect) return legacyRedirect;

  const secretKey = resolveSecretKey();
  const natalWorkerRequest = isAuthenticatedNatalWorkerRequest(request, pathname);

  // Local async worker must finish in-flight paid jobs during maintenance.
  if (!natalWorkerRequest) {
    const maintenanceResponse = await enforceMaintenanceMode(request, pathname, secretKey);
    if (maintenanceResponse) return maintenanceResponse;
  }

  const needsAuthSecret =
    pathname.startsWith("/api/") ||
    pathname.startsWith("/cabinet") ||
    pathname.startsWith("/expert") ||
    (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login"));

  if (needsAuthSecret && !secretKey) {
    return misconfiguredResponse(pathname);
  }

  if (pathname.startsWith("/api/")) {
    if (isPublicApiRoute(pathname)) {
      return NextResponse.next();
    }
    if (natalWorkerRequest) {
      return NextResponse.next();
    }

    const token = request.cookies.get(COOKIE)?.value;
    if (!token || !secretKey) {
      return unauthorizedApiResponse();
    }

    const role = await verifyRole(token, secretKey);
    if (!role) {
      return unauthorizedApiResponse();
    }

    const apiRole = requiredApiRole(pathname);
    if (apiRole && role !== apiRole) {
      return forbiddenApiResponse();
    }

    return NextResponse.next();
  }

  let requiredRole: AuthRole | null = null;
  if (pathname.startsWith("/cabinet")) requiredRole = "user";
  else if (pathname.startsWith("/expert")) requiredRole = "expert";
  else if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    requiredRole = "admin";
  }

  if (!requiredRole) return NextResponse.next();

  const token = request.cookies.get(COOKIE)?.value;
  if (!token || !secretKey) return redirectToLogin(request, requiredRole);

  const role = await verifyRole(token, secretKey);
  if (!role || role !== requiredRole) {
    return redirectToLogin(request, requiredRole);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.svg|opengraph-image|decks/|sw-app-shell.js|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|css|js|map|txt|xml)$).*)",
  ],
};
