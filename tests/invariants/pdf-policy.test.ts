import { describe, expect, it } from "vitest";
import { printPathKind, pdfOrigin, allowPdfRequest } from "@/lib/reports/pdf-policy";

describe("PDF isolation", () => {
  const path = "/cabinet/astrology/reports/11111111-1111-4111-8111-111111111111/print";
  it("accepts only known report paths, not arbitrary URLs or navigation", () => {
    expect(printPathKind(path)).toBe("private");
    for (const bad of ["https://evil.test" + path, "//evil.test", path + "?x=1", "/api/admin", "/cabinet/../api/health", path.replace("11111111-1111-4111-8111-111111111111", "%2e%2e")]) {
      expect(printPathKind(bad)).toBeNull();
    }
    expect(printPathKind("/r/abcdefghijklmnopqrstuv/print")).toBe("public");
  });
  it("never uses a public host or credentials as its rendering origin", () => {
    expect(pdfOrigin("http://127.0.0.1:3417")).toBe("http://127.0.0.1:3417");
    for (const bad of ["https://evil.test", "http://user:pass@localhost:3000", "file:///etc/passwd", "http://localhost:3000/api"]) expect(() => pdfOrigin(bad)).toThrow();
  });
  it("blocks external resources, redirects, and unrelated internal APIs", () => {
    const target = new URL(path, "http://127.0.0.1:3000");
    expect(allowPdfRequest(target.href, "document", target)).toBe(true);
    expect(allowPdfRequest(new URL("/_next/static/font.woff2", target).href, "font", target)).toBe(true);
    for (const url of ["https://evil.test/font", "http://169.254.169.254/", new URL("/api/admin", target).href]) expect(allowPdfRequest(url, "fetch", target)).toBe(false);
    expect(allowPdfRequest(new URL("/auth/user/login", target).href, "document", target)).toBe(false);
    const pro = new URL("/r/abcdefghijklmnopqrstuv/print", target);
    expect(allowPdfRequest(new URL("/api/pro/public/report/abcdefghijklmnopqrstuv", target).href, "fetch", pro)).toBe(true);
    expect(allowPdfRequest(new URL("/api/pro/public/report/another-token", target).href, "fetch", pro)).toBe(false);
  });
});
