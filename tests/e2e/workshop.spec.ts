import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("generates, repairs, restores, finalizes, and downloads", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Generate candidates" }).click();
  await expect(
    page.getByRole("heading", { name: "Inspect the evidence." }),
  ).toBeVisible();
  await expect(
    page.getByText("geometry.rear_run", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Parameter ranges and derived rear run",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Diagnose & repair" }).click();
  await expect(page.getByText("Repair passed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "All hard checks pass" }),
  ).toBeVisible();
  await expect(page.getByText("Cycle 3", { exact: true })).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Inspect the evidence." }),
  ).toBeVisible();
  await expect(page.getByText("Repair passed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Select verified export" }).click();
  await expect(
    page.getByRole("heading", { name: "Make the digital plan physical." }),
  ).toBeVisible();
  await expect(
    page.getByText("Verified in software", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Physical test required", { exact: true }),
  ).toBeVisible();

  const svgDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG" }).click();
  const svgDownload = await svgDownloadPromise;
  expect(svgDownload.suggestedFilename()).toMatch(/\.svg$/);
  const svgPath = await svgDownload.path();
  expect(svgPath).not.toBeNull();
  if (svgPath) {
    const svg = await readFile(svgPath, "utf8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("50 mm calibration");
  }

  const foldDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download FOLD 1.2" }).click();
  const foldDownload = await foldDownloadPromise;
  expect(foldDownload.suggestedFilename()).toMatch(/\.fold$/);
  const foldPath = await foldDownload.path();
  expect(foldPath).not.toBeNull();
  if (foldPath) {
    const fold = JSON.parse(await readFile(foldPath, "utf8")) as {
      readonly file_spec?: number;
    };
    expect(fold.file_spec).toBe(1.2);
  }

  expect(consoleErrors).toEqual([]);
});

test("has no horizontal overflow at the required viewport matrix", async ({
  page,
}) => {
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(
      dimensions.scrollWidth,
      `overflow at ${width}px`,
    ).toBeLessThanOrEqual(dimensions.clientWidth);
  }
});

test("supports keyboard operation and persistent sound preference", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "FoldForge home" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  const soundButton = page.getByRole("button", {
    name: "Enable workshop sounds",
  });
  await expect(soundButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Mute workshop sounds" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Mute workshop sounds" }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("fails safely when an API returns malformed data", async ({ page }) => {
  await page.route("**/api/generate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ candidates: "not-an-array" }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Generate candidates" }).click();
  await expect(page.locator('[class*="errorBanner"]')).toContainText(
    "outside the expected strict contract",
  );
  await expect(
    page.getByRole("heading", { name: "Define the physical problem." }),
  ).toBeVisible();
});

test.describe("reduced motion", () => {
  test("removes smooth scrolling and transitions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const styles = await page.evaluate(() => {
      const button = document.querySelector("button");
      return {
        scrollBehavior: getComputedStyle(document.documentElement)
          .scrollBehavior,
        transitionDuration: button
          ? getComputedStyle(button).transitionDuration
          : "missing",
      };
    });
    expect(styles.scrollBehavior).toBe("auto");
    expect(Number.parseFloat(styles.transitionDuration)).toBeLessThanOrEqual(
      0.00001,
    );
  });
});
