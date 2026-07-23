import { expect, test } from "@playwright/test";

test("personal memory explainer is public and transparent", async ({ page }) => {
  await page.goto("/about/personal-memory");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Персональная память");
  await expect(page.getByText("Черновики не подставляются в консультации")).toBeVisible();
  await expect(page.getByText(/Чистого листа|Свежий сеанс/).first()).toBeVisible();
  await expect(page.getByText(/полная очистка памяти/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Политике обработки персональных данных" })
  ).toHaveAttribute("href", "/privacy");
});
