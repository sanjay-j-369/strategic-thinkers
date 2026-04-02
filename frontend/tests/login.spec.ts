import { test, expect } from '@playwright/test';

test.describe('Authentication E2E Tests', () => {
  const TEST_EMAIL = 'saggb131@gmail.com';
  // Attempt with first password
  const TEST_PASSWORD = 'Sanjana@2026'; // Alternatively: 'Sanjana@2004'

  test('User can sign in successfully via Clerk', async ({ page }) => {
    // 1. Navigate to the local frontend
    // Change this URL if your frontend runs on a different port.
    await page.goto('http://localhost:3001');

    // 2. Identify and click the Sign In / Login button
    // (Adjust the selector based on how your app triggers login, e.g., 'text=Sign In')
    const signInButton = page.locator('text=Sign In');
    
    if (await signInButton.isVisible()) {
      await signInButton.click();
    } else {
      // If the app automatically redirects to Clerk auth, or we go directly to a protected route:
      await page.goto('http://localhost:3001/guide');
    }

    // 3. Fill in Clerk Authentication Form (Clerk's default selectors)
    // Wait for the Clerk sign-in form to appear
    await expect(page.locator('.cl-signIn-root')).toBeVisible({ timeout: 10000 });

    // Fill in Email
    await page.fill('input[type="email"], input[name="identifier"]', TEST_EMAIL);
    await page.click('button:has-text("Continue")');

    // Expected Clerk behavior: It switches to the password step
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10000 });

    // Fill in Password
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Continue")');

    // 4. Verify successful login by checking if a protected resource / dashboard element is visible
    // Wait for redirect to finish and look for the 'Strategic AI Advisor' or similar header element
    await expect(page.locator('text=Ask the Guide')).toBeVisible({ timeout: 15000 });
  });
});
