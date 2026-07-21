/** One-shot flag: after DELETE /api/user/delete, prefer homepage over /auth/login. */
export const ACCOUNT_DELETED_HOME_KEY = "zovus_account_deleted_home";

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

export function markAccountDeletedHome(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ACCOUNT_DELETED_HOME_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** If post-delete flag is set, hard-navigate home and return true. */
export function consumeAccountDeletedHomeRedirect(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(ACCOUNT_DELETED_HOME_KEY) !== "1") return false;
    const home = homeUrlAfterAccountDeletion();
    sessionStorage.removeItem(ACCOUNT_DELETED_HOME_KEY);
    window.location.replace(home);
    return true;
  } catch {
    return false;
  }
}
