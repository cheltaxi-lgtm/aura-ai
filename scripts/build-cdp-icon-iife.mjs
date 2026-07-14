import fs from "fs";

const b64 = fs.readFileSync(".tmp-oauth-icon.b64", "utf8").trim();
const expression = `(() => {
  const b64 = ${JSON.stringify(b64)};
  const input = document.querySelector('input[type=file]');
  if (!input) return { ok: false, reason: 'no input' };
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const file = new File([arr], 'zovus-icon.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return { ok: true, files: input.files.length, name: input.files[0]?.name };
})()`;

const payload = {
  method: "Runtime.evaluate",
  params: { expression, returnByValue: true },
};

fs.writeFileSync(".tmp-cdp-expr.json", JSON.stringify(payload));
console.log("expression length:", expression.length);
