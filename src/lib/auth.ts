import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export type AuthRole = "user" | "expert" | "admin";

export interface AuthPayload {
  sub: string;
  role: AuthRole;
  email: string;
  name: string;
  slug?: string;
}

export type CookieRequestContext = {
  headers: { get(name: string): string | null };
  nextUrl?: { protocol: string };
};

const COOKIE = "aura_auth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Secure cookies are dropped on plain HTTP — derive from the incoming request. */
export function resolveCookieSecure(request?: CookieRequestContext): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;

  const forwardedProto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const isHttps =
    forwardedProto === "https" || request?.nextUrl?.protocol === "https:";

  if (!isHttps) return false;

  if (process.env.COOKIE_SECURE === "true") return true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return appUrl.startsWith("https://");
}

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret === "dev-secret-change-in-production") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return new TextEncoder().encode("dev-secret-change-in-production");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signToken(payload: AuthPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as AuthPayload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(payload: AuthPayload, request?: CookieRequestContext) {
  const token = await signToken(payload);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function clearAuthCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getAuth(): Promise<AuthPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "master";
}
