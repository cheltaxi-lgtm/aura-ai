import { afterEach, describe, expect, it, vi } from "vitest";
import { clearStaleBrowserAppShell, shouldUseAppShellClient } from "@/lib/app-shell";
import { withAppShellAuthParams } from "@/lib/auth-pending";
import { homeUrlAfterAccountDeletion } from "@/lib/account-deleted";
import { welcomeEmailHtml } from "@/lib/email/templates";
import { navigateToAppHome, navigateToAppSection, navigateToCabinet, navigateToDecksModal, navigateToPhotoReading, navigateToRitualFlow } from "@/lib/app-shell-nav";

vi.mock("@/lib/session-bridge", () => ({ shouldUseSessionBridge: () => false }));

function browser(native = false, sticky = false, pathname = "/rasklady") {
  const values = new Map(sticky ? [["zovus_app_shell", "1"]] : []);
  const assign = vi.fn();
  const replaceState = vi.fn();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile", maxTouchPoints: 5 });
  vi.stubGlobal("window", {
    location: { origin: "https://zovus.ru", hostname: "zovus.ru", pathname, search: "", assign },
    history: { replaceState }, dispatchEvent: vi.fn(),
    Capacitor: { isNativePlatform: () => native },
  });
  return { values, assign, replaceState };
}

afterEach(() => vi.unstubAllGlobals());

describe("mobile website stays outside app shell", () => {
  it("ignores a stale shell flag on a phone", () => {
    browser(false, true);
    expect(shouldUseAppShellClient()).toBe(false);
  });

  it("clears obsolete browser state", () => {
    const { values } = browser(false, true);
    const dataset = { appShell: "android", motionLite: "1" };
    vi.stubGlobal("document", { documentElement: { dataset } });
    clearStaleBrowserAppShell();
    expect(values.has("zovus_app_shell")).toBe(false);
    expect(dataset).toEqual({});
  });

  it.each([false, true])("auth and deletion preserve only the actual shell (native=%s)", (native) => {
    browser(native, true);
    const authTarget = new URL(withAppShellAuthParams("/cabinet"), "https://zovus.ru");
    expect(authTarget.searchParams.has("app")).toBe(native);
    expect(authTarget.searchParams.has("_auth")).toBe(true);
    expect(homeUrlAfterAccountDeletion()).toBe(native ? "/?app=1" : "/");
  });

  it("supports an explicitly requested shell preview", () => {
    browser();
    window.location.search = "?app=1";
    expect(shouldUseAppShellClient()).toBe(true);
  });

  it("welcome email never activates app chrome for a website visitor", () => {
    expect(welcomeEmailHtml("Анна")).not.toContain("app=1");
    expect(welcomeEmailHtml("Анна")).toContain("?step=masters");
  });

  for (const navigate of [navigateToAppHome, navigateToCabinet, navigateToDecksModal, navigateToPhotoReading, navigateToRitualFlow, () => navigateToAppSection("тарифы")]) {
    it(`does not activate app chrome after ${navigate.name || "section"}`, () => {
      const { values, assign } = browser();
      navigate();
      expect(new URL(assign.mock.calls[0][0]).searchParams.has("app")).toBe(false);
      expect(values.has("zovus_app_shell")).toBe(false);
      expect(shouldUseAppShellClient()).toBe(false);
    });
    it(`preserves native navigation after ${navigate.name || "section"}`, () => {
      const { assign } = browser(true);
      navigate();
      expect(new URL(assign.mock.calls[0][0]).searchParams.get("app")).toBe("1");
      expect(shouldUseAppShellClient()).toBe(true);
    });
  }

  it("does not stamp the app query during home-page navigation", () => {
    const { replaceState } = browser(false, false, "/");
    navigateToAppHome();
    expect(new URL(replaceState.mock.calls[0][2], "https://zovus.ru").searchParams.has("app")).toBe(false);
  });
});
