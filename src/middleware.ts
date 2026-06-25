import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

import { jwtVerify } from "jose";



const COOKIE = "aura_auth";



type AuthRole = "user" | "expert" | "admin";



/** API routes reachable without a valid JWT (handlers may still enforce their own rules). */

const PUBLIC_API_EXACT = new Set([

  "/api/health",

  "/api/masters",

  "/api/platform/features",

  "/api/runes/config",

  "/api/runes/packages",

  "/api/ritual/moon",

  "/api/ritual/stats",

  "/api/session",

  "/api/debug/client-log",

  "/api/influencer/register",

  "/api/payment/webhook",

  "/api/payments/webhook",

  "/api/runes/webhook",

]);



const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/scene-art/"] as const;



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



function redirectToLogin(request: NextRequest, role: AuthRole) {

  const url = request.nextUrl.clone();

  url.pathname = loginPathForRole(role);

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



export async function middleware(request: NextRequest) {

  const { pathname } = request.nextUrl;



  if (request.method === "OPTIONS") {

    return NextResponse.next();

  }



  const secretKey = resolveSecretKey();

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



    const token = request.cookies.get(COOKIE)?.value;

    if (!token || !secretKey) {

      return unauthorizedApiResponse();

    }



    const role = await verifyRole(token, secretKey);

    if (!role) {

      return unauthorizedApiResponse();

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
    "/cabinet/:path*",
    "/expert/:path*",
    "/admin/:path*",
    // Photo upload routes auth in their handlers — skip middleware body buffering.
    "/api/((?!photo-reading/recognize|photo-reading/client-log).*)",
  ],
};


