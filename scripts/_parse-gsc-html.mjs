import { readFileSync } from "fs";
const html = readFileSync(".cursor/gsc-security-review/pick-01.html", "utf8");
const idx = html.indexOf("Подтверд");
console.log(html.slice(idx - 500, idx + 300));
console.log("\n==== ALL Подтверд ====");
let i = 0;
let pos = 0;
while ((pos = html.indexOf("Подтверд", pos)) >= 0 && i < 10) {
  console.log(i, pos, html.slice(pos, pos + 80).replace(/\s+/g, " "));
  // find nearest role=button or button before this
  const before = html.slice(Math.max(0, pos - 800), pos);
  const buttonOpen = Math.max(before.lastIndexOf("<button"), before.lastIndexOf('role="button"'));
  console.log("  nearest", before.slice(buttonOpen, buttonOpen + 200).replace(/\s+/g, " "));
  pos += 1;
  i++;
}
