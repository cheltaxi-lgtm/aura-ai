import fs from "fs";

const path = process.argv[2] || "/opt/aura-ai/.env.local";
const keys = [
  "YANDEX_OAUTH_CLIENT_ID",
  "YANDEX_OAUTH_CLIENT_SECRET",
  "VK_CLIENT_ID",
  "VK_CLIENT_SECRET",
  "MAILRU_CLIENT_ID",
  "MAILRU_CLIENT_SECRET",
  "YANDEX_METRIKA_CLIENT_ID",
  "YANDEX_METRIKA_CLIENT_SECRET",
];

const env = Object.fromEntries(
  fs
    .readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf("=");
      if (i <= 0) return null;
      return [line.slice(0, i), line.slice(i + 1).trim()];
    })
    .filter(Boolean)
);

for (const key of keys) {
  const val = env[key] ?? "";
  console.log(`${key}=${val.length > 0 ? `set(${val.length})` : "empty"}`);
}
