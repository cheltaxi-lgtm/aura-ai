import { readFileSync } from "fs";
const html = readFileSync(".cursor/gsc-security-review/pick-01.html", "utf8");
const contents = [...html.matchAll(/content[=:\\"]+([A-Za-z0-9_-]{20,})/g)].map((m) => m[1]);
console.log([...new Set(contents)]);

// Search AF_initData / verification tokens near a07e95
const idx = html.indexOf("a07e95e8199f7e09");
console.log("idx", idx);
console.log(html.slice(idx - 300, idx + 400));

// Look for google-site-verification in unicode escapes
const u = html.match(/google.site.verification[^,]{0,80}/gi);
console.log("u", u?.slice(0, 20));
