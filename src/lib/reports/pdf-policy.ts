const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const TOKEN = "[A-Za-z0-9_-]{10,160}";
const PRIVATE = new RegExp(`^/cabinet/(?:astrology/(?:reports|compatibility)|human-design/(?:reports|composite-reports)|numerology/matrix|readings)/${UUID}/print$`);
const JOINT = new RegExp(`^/joint-reading/${TOKEN}/print$`);
const PUBLIC = new RegExp(`^/(?:r|reports/shared)/${TOKEN}/print$`);

export function printPathKind(path: string): "private" | "public" | null {
  if (PRIVATE.test(path) || JOINT.test(path)) return "private";
  return PUBLIC.test(path) ? "public" : null;
}

/** Deployment configuration only. Request Host/forwarded headers are never used. */
export function pdfOrigin(configured?: string): string {
  const url = new URL(configured?.trim() || "http://127.0.0.1:3000");
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("pdf_origin_invalid");
  }
  return url.origin;
}

export function allowPdfRequest(raw: string, type: string, target: URL): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol === "data:" || url.protocol === "blob:") return type === "image" || type === "font";
  if (url.origin !== target.origin || url.username || url.password) return false;
  if (type === "document") return url.pathname === target.pathname && !url.search;
  if (url.pathname.startsWith("/api/")) {
    const token = target.pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/print$/)?.[1];
    return Boolean(token && url.pathname === `/api/pro/public/report/${token}` && !url.search);
  }
  if (url.pathname === "/_next/image") {
    const imagePath = url.searchParams.get("url") ?? "";
    if (!imagePath.startsWith("/") || imagePath.startsWith("//")) return false;
  }
  return ["stylesheet", "script", "image", "font", "media"].includes(type);
}
