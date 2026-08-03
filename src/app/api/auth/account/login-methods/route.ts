import { NextRequest, NextResponse } from "next/server";
import { getAuth, hashPassword, normalizeAuthEmail, setAuthCookie } from "@/lib/auth";
import { validatePasswordLength } from "@/lib/auth-policy";
import { ensureDb, query } from "@/lib/db";
import { findUserByEmail, findUserById } from "@/lib/accounts";
import {
  isDeliverableUserEmail,
  isSyntheticAccountEmail,
} from "@/lib/email/mail-config";
import {
  listOAuthProvidersForAccount,
  unlinkOAuthFromAccount,
} from "@/lib/oauth/accounts";
import type { OAuthProvider } from "@/lib/oauth/types";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { clientIp } from "@/lib/api-guards";

export const runtime = "nodejs";

/** List login methods for the current account (cabinet / bot shell upgrade). */
export async function GET() {
  const auth = await getAuth();
  if (!auth || auth.role !== "user") {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const { rows } = await query<{
    email: string;
    password_hash: string | null;
  }>(`SELECT email, password_hash FROM user_accounts WHERE id = $1`, [auth.sub]);
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "account_missing" }, { status: 404 });
  }

  const providers = await listOAuthProvidersForAccount(auth.sub);
  const synthetic = isSyntheticAccountEmail(row.email);

  return NextResponse.json({
    ok: true,
    email: synthetic ? null : row.email,
    hasPassword: Boolean(row.password_hash),
    syntheticEmail: synthetic,
    providers,
    canAddEmail: synthetic || !row.password_hash,
  });
}

/** Attach a real email + password to a synthetic shell account. */
export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (!auth || auth.role !== "user") {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const ip = clientIp(request);
  const rl = await checkRateLimit(
    rateLimitKey("login_methods_email", auth.sub || ip),
    8,
    60 * 60 * 1000
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много попыток. Попробуйте позже." },
      { status: 429 }
    );
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const email = normalizeAuthEmail(emailRaw);
  if (!isDeliverableUserEmail(email)) {
    return NextResponse.json(
      { error: "invalid_email", message: "Укажите настоящий email." },
      { status: 422 }
    );
  }
  const pwErr = validatePasswordLength(password);
  if (pwErr) {
    return NextResponse.json({ error: "invalid_password", message: pwErr }, { status: 422 });
  }

  const account = await findUserById(auth.sub);
  if (!account) {
    return NextResponse.json({ error: "account_missing" }, { status: 404 });
  }

  const { rows: full } = await query<{ email: string; password_hash: string | null }>(
    `SELECT email, password_hash FROM user_accounts WHERE id = $1`,
    [auth.sub]
  );
  const current = full[0];
  if (!current) {
    return NextResponse.json({ error: "account_missing" }, { status: 404 });
  }

  if (!isSyntheticAccountEmail(current.email) && current.password_hash) {
    return NextResponse.json(
      {
        error: "already_has_login",
        message: "У аккаунта уже есть email и пароль. Смените пароль через «Забыли пароль».",
      },
      { status: 409 }
    );
  }

  const taken = await findUserByEmail(email);
  if (taken && taken.id !== auth.sub) {
    return NextResponse.json(
      { error: "email_taken", message: "Этот email уже занят. Войдите им или выберите другой." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  await query(
    `UPDATE user_accounts SET email = $2, password_hash = $3 WHERE id = $1`,
    [auth.sub, email, passwordHash]
  );

  await setAuthCookie(
    {
      sub: auth.sub,
      role: "user",
      email,
      name: account.name || auth.name || "Гость",
    },
    request
  );

  return NextResponse.json({
    ok: true,
    email,
    hasPassword: true,
    message: "Email и пароль сохранены. Теперь можно входить с компьютера.",
  });
}

/** Unlink Yandex/VK from the current account. */
export async function DELETE(request: NextRequest) {
  const auth = await getAuth();
  if (!auth || auth.role !== "user") {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const ip = clientIp(request);
  const rl = await checkRateLimit(
    rateLimitKey("login_methods_unlink", auth.sub || ip),
    20,
    60 * 60 * 1000
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много попыток. Попробуйте позже." },
      { status: 429 }
    );
  }

  let body: { provider?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const provider = body.provider === "yandex" || body.provider === "vk"
    ? (body.provider as OAuthProvider)
    : null;
  if (!provider) {
    return NextResponse.json(
      { error: "invalid_provider", message: "Укажите yandex или vk." },
      { status: 422 }
    );
  }

  const result = await unlinkOAuthFromAccount(auth.sub, provider);
  if (!result.ok) {
    const message =
      result.error === "last_login_method"
        ? "Нельзя отвязать последний способ входа. Сначала добавьте другой."
        : result.error === "not_linked"
          ? "Эта соцсеть не привязана."
          : "Не удалось отвязать.";
    return NextResponse.json({ ok: false, error: result.error, message }, { status: 409 });
  }

  const label = provider === "yandex" ? "Яндекс" : "VK";
  return NextResponse.json({
    ok: true,
    provider,
    message: `${label} отвязан. Привязать снова можно ниже.`,
  });
}
