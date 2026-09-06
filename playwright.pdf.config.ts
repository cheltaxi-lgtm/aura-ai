import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const chrome = process.env.PDF_TEST_CHROME || (process.platform === "win32" && existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe") ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined);
const baseURL = process.env.PDF_E2E_BASE_URL || "http://127.0.0.1:3418";
export default defineConfig({ testDir:"./tests/e2e",testMatch:"pdf.public.spec.ts",workers:1,
  use:{baseURL,launchOptions:{executablePath:chrome},screenshot:"only-on-failure",trace:"retain-on-failure"},
  webServer:process.env.PDF_E2E_BASE_URL ? undefined : {command:"npx next dev --hostname 127.0.0.1 --port 3418",url:baseURL,reuseExistingServer:true,env:{PRO_MODULE_ENABLED:"true",NEXT_DIST_DIR:".next-pdf-e2e"}},
});
