import { expect, test } from "@playwright/test";

test("mounts and disposes the Rust-owned RSX subtree", async ({ page }) => {
  await page.goto("/");

  const root = page.locator("#host > section.cart");
  await expect(root).toHaveAttribute("class", "cart");
  await expect(root.locator("h1")).toHaveText("Cart");
  await expect(root.locator(".branch")).toHaveText("Shown");
  await expect(root.locator(".rows li")).toHaveText(["First", "Second"]);

  await page.evaluate(() => globalThis.toggleRsx());
  await expect(root.locator(".branch")).toHaveText("Hidden");

  const first = root.locator(".rows li").nth(0);
  await first.evaluate((element) => { globalThis.__firstRsxRow = element; });
  await page.evaluate(() => globalThis.reorderRsx());
  await expect(root.locator(".rows li")).toHaveText(["Second", "First", "Third"]);
  await expect(root.locator(".rows li").nth(1)).toHaveAttribute("data-id", "1");
  expect(await page.evaluate(() => document.querySelectorAll(".rows li")[1] === globalThis.__firstRsxRow)).toBe(true);

  await page.evaluate(() => globalThis.disposeRsx());

  await expect(root).toHaveCount(0);
  await expect(page.locator("#host")).toBeEmpty();
});
