import { expect, test } from "@playwright/test";

test.describe("Authentication E2E Tests", () => {
  test("User can sign up and land on the home page", async ({ page }) => {
    const uniqueSuffix = `${Date.now()}`;
    await page.goto("http://localhost:3001/sign-up");

    await page.fill('input[placeholder="Jane Founder"]', "Playwright Founder");
    await page.fill('input[type="email"]', `playwright-${uniqueSuffix}@example.com`);
    await page.fill('input[type="password"]', "Playwright@2026");
    await page.click('button:has-text("Create Account")');

    await expect(page.locator("text=Connected Sources")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator("text=Founder operations, tuned for fast decisions.")).toBeVisible({
      timeout: 15000,
    });
  });
});
