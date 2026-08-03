/** One-shot marker: after DELETE /api/user/delete, prefer homepage over /auth/login. */
export const ACCOUNT_DELETED_HOME_KEY = "zovus_account_deleted_home";
export const ACCOUNT_DELETED_HOME_VERSION = 1;
export const ACCOUNT_DELETED_HOME_MAX_AGE_MS = 30_000;

interface AccountDeletedHomeMarker {
  v: typeof ACCOUNT_DELETED_HOME_VERSION;
  createdAt: number;
}

function readAccountDeletedHomeMarker(now = Date.now()): AccountDeletedHomeMarker | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ACCOUNT_DELETED_HOME_KEY);
    if (!raw) return null;
    const marker = JSON.parse(raw) as Partial<AccountDeletedHomeMarker>;
    const age = now - (marker.createdAt ?? Number.NaN);
    if (
      marker.v !== ACCOUNT_DELETED_HOME_VERSION ||
      !Number.isFinite(marker.createdAt) ||
      age < 0 ||
      age > ACCOUNT_DELETED_HOME_MAX_AGE_MS
    ) {
      sessionStorage.removeItem(ACCOUNT_DELETED_HOME_KEY);
      return null;
    }
    return marker as AccountDeletedHomeMarker;
  } catch {
    try {
      sessionStorage.removeItem(ACCOUNT_DELETED_HOME_KEY);
    } catch {
      /* private mode */
    }
    return null;
  }
}

export function homeUrlAfterAccountDeletion(): string {
  if (typeof window === "undefined") return "/";
  try {
    if (sessionStorage.getItem("zovus_app_shell") === "1") {
      return "/?app=1";
    }
  } catch {
    /* private mode */
  }
  return "/";
}

/** Create the marker once; repeated deletion cleanup must not extend its lifetime. */
export function markAccountDeletedHome(now = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (readAccountDeletedHomeMarker(now)) return false;
    const marker: AccountDeletedHomeMarker = {
      v: ACCOUNT_DELETED_HOME_VERSION,
      createdAt: now,
    };
    sessionStorage.setItem(ACCOUNT_DELETED_HOME_KEY, JSON.stringify(marker));
    return true;
  } catch {
    return false;
  }
}

/** If a fresh post-delete marker exists, hard-navigate home without consuming it. */
export function redirectHomeAfterAccountDeletion(): boolean {
  if (typeof window === "undefined") return false;
  if (!readAccountDeletedHomeMarker()) return false;
  window.location.replace(homeUrlAfterAccountDeletion());
  return true;
}

/** Consume only after the destination homepage has mounted successfully. */
export function consumeAccountDeletedHomeArrival(now = Date.now()): boolean {
  if (typeof window === "undefined" || window.location.pathname !== "/") return false;
  if (!readAccountDeletedHomeMarker(now)) return false;
  try {
    sessionStorage.removeItem(ACCOUNT_DELETED_HOME_KEY);
    return true;
  } catch {
    return false;
  }
}
