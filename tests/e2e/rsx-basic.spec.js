import { expect, test } from "@playwright/test";

test("mounts and disposes the Rust-owned RSX subtree", async ({ page }) => {
  await page.goto("/");

  const root = page.locator("#host > section.cart");
  await expect(root).toHaveAttribute("class", "cart");
  await expect(root.locator("h1")).toHaveText("Cart");
  await expect(root.locator("span")).toHaveText("3");

  await page.evaluate(() => globalThis.disposeRsx());

  await expect(root).toHaveCount(0);
  await expect(page.locator("#host")).toBeEmpty();
});
