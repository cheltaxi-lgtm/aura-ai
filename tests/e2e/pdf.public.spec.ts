import { test, expect } from "@playwright/test";
const token="pdf-browser-synthetic-report";
const payload={report:{brandName:"ZOVUS",caseType:"natal",blocks:[{id:"one",title:"Сохранённый разбор",body:"Полный текст отчёта без потери разделов.\n\n| Область | Вывод |\n|---|---|\n| Отношения | Поддержка |",practice:"Один следующий шаг."}],signature:"Ваш наставник",disclaimer:"Синтетическая проверка"}};
test("failed report load is retryable and never marked ready",async({page})=>{
 let failed=true;await page.route(`**/api/pro/public/report/${token}`,r=>r.fulfill(failed?{status:503,json:{error:"fixture"}}:{json:payload}));
 await page.goto(`/r/${token}/print`);await expect(page.locator("[data-pdf-error]")).toBeVisible();await expect(page.locator('[data-pdf-ready="true"]')).toHaveCount(0);
 failed=false;await page.getByRole("button",{name:"Повторить загрузку"}).click();await expect(page.locator('[data-pdf-ready="true"]')).toBeVisible();await expect(page.locator("table")).toContainText("Поддержка");await expect(page.getByText("Ваш наставник",{exact:true})).toBeVisible();
});
test("mobile document stays within viewport and reports download failures",async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.route(`**/api/pro/public/report/${token}`,r=>r.fulfill({json:payload}));await page.route(`**/api/pro/public/report/${token}/pdf`,r=>r.fulfill({status:503,json:{error:"pdf_busy"}}));
 await page.goto(`/r/${token}/print`);await expect(page.locator('[data-pdf-ready="true"]')).toBeVisible();expect(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole("button",{name:"Скачать PDF",exact:true}).click();await expect(page.locator(".pdf-download [role=alert]")).toBeVisible();await expect(page.getByRole("button",{name:"Скачать PDF",exact:true})).toBeEnabled();
});
test("anonymous requests cannot export a private report",async({request})=>{
 const result=await request.get('/api/reports/pdf?path='+encodeURIComponent('/cabinet/readings/11111111-1111-4111-8111-111111111111/print'));expect(result.status()).toBe(401);
});
