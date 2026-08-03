import { readFileSync } from "fs";
const html = readFileSync(".cursor/gsc-security-review/pick-01.html", "utf8");
// Search around verification payloads
const keys = ["a07e95e8199f7e09", "google-site-verification:", "nupQLb", "PHNxDb", "download"];
for (const k of keys) {
  let pos = 0;
  let n = 0;
  while ((pos = html.indexOf(k, pos)) >= 0 && n < 3) {
    console.log("\nKEY", k, pos);
    console.log(html.slice(pos, pos + 400).replace(/\s+/g, " "));
    pos += k.length;
    n++;
  }
}
// Find base64-looking blobs near googlea07
const idx = html.indexOf("googlea07e95e8199f7e09");
const window = html.slice(Math.max(0, idx - 5000), idx + 2000);
const b64 = window.match(/[A-Za-z0-9+/]{40,}={0,2}/g);
console.log("\nb64 candidates", b64?.slice(0, 20));
