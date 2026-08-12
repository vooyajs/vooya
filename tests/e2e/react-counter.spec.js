import { expect, test } from "@playwright/test";

test("runs the Rust .voo component through the React lifecycle", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");

  await expect(page.locator("[data-vooya-host]")).toHaveAttribute(
    "data-voo-scope",
    /^voo-[a-f0-9]+$/,
  );
  await expect(page.locator(".vooya-counter")).toHaveCSS("display", "flex");

  await expect(page.getByRole("status")).toHaveText("1");
  await page.getByRole("button", { name: "Increment" }).click();
  await expect(page.getByRole("status")).toHaveText("2");
  await expect(page.getByText("React received: 2")).toBeVisible();

  await page.getByRole("button", { name: "Set React prop to 10" }).click();
  await expect(page.getByRole("status")).toHaveText("10");

  await page.getByRole("button", { name: "Toggle Vooya island" }).click();
  await expect(page.getByRole("button", { name: "Increment" })).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle Vooya island" }).click();
  await expect(page.getByRole("status")).toHaveText("10");

  expect(browserErrors).toEqual([]);
});
