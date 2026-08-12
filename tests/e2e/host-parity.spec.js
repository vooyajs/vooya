import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const root = resolve(import.meta.dirname, "../..");
const consumers = [
  { host: "Vue", url: "http://127.0.0.1:4174" },
  { host: "React", url: "http://127.0.0.1:4175" },
];

test("runs one Rust component with the same contract in Vue and React", async ({ browser }) => {
  expect(readFileSync(resolve(root, "examples/vue-counter/src/Counter.voo"), "utf8")).toBe(
    readFileSync(resolve(root, "examples/react-counter/src/Counter.voo"), "utf8"),
  );

  const results = [];
  for (const consumer of consumers) {
    const page = await browser.newPage();
    const browserErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));

    await page.goto(consumer.url);
    await expect(page.locator("[data-vooya-host]")).toHaveAttribute(
      "data-voo-scope",
      /^voo-[a-f0-9]+$/,
    );
    await expect(page.getByRole("status")).toHaveText("1");

    await page.getByRole("button", { name: "Increment" }).click();
    await expect(page.getByRole("status")).toHaveText("2");
    await expect(page.getByText(`${consumer.host} received: 2`)).toBeVisible();

    await page.getByRole("button", { name: `Set ${consumer.host} prop to 10` }).click();
    await expect(page.getByRole("status")).toHaveText("10");

    await page.getByRole("button", { name: "Toggle Vooya island" }).click();
    await expect(page.getByRole("button", { name: "Increment" })).toHaveCount(0);
    await page.getByRole("button", { name: "Toggle Vooya island" }).click();
    await expect(page.getByRole("status")).toHaveText("10");

    results.push({
      island: await page.locator("[data-vooya-island]").getAttribute("data-vooya-island"),
      valueAfterRemount: await page.getByRole("status").textContent(),
      browserErrors,
    });
    await page.close();
  }

  expect(results[1]).toEqual(results[0]);
});
