import { expect, test } from "@playwright/test";

for (const width of [320, 375, 768, 1280, 1920]) {
  for (const mode of ["light", "dark"] as const) {
    test(`SDY нүүр ${width}px ${mode}`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(mode => localStorage.setItem("gerege_theme", JSON.stringify({ mode })), mode);
      await page.goto("/");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText("Салбартаа нэгдэж,оролцоогоо бүртгэе.");
      await expect(page.locator("html")).toHaveClass(mode === "dark" ? /dark/ : /^(?!.*\bdark\b)/);
      await expect(page.getByRole("heading", { name: "Оролцоо бүрээ нэг дороос" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const signIn = page.getByRole("link", { name: "e-ID-аар нэвтрэх", exact: true }).filter({ visible: true });
      expect(await signIn.count()).toBeGreaterThanOrEqual(2);
      for (const link of await signIn.all()) {
        await expect(link).toHaveAttribute("href", "/login?next=%2Fmember");
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.locator('[data-sdy-landing="true"]')).toHaveCSS("background-color", mode === "dark" ? "rgb(12, 17, 27)" : "rgb(255, 255, 255)");
      if (width === 320 || width === 1280) await page.screenshot({ path: testInfo.outputPath(`landing-${width}-${mode}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
}

test("утасны цэс, FAQ, хуучин холбоос болон нэвтрэх урсгал", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ status: path.endsWith("/auth/me") ? 401 : 200, contentType: "application/json", body: JSON.stringify(path.endsWith("/auth/sso/config") ? { enabled: false, local_login: true, eid: { enabled: true } } : {}) });
  });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Үндсэн агуулга руу очих" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  const menu = page.locator('summary[aria-label="Цэс нээх"]');
  await menu.click();
  await expect(page.getByRole("navigation", { name: "Гар утасны цэс" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Гар утасны цэс" })).toBeHidden();
  await menu.click();
  await page.getByRole("navigation", { name: "Гар утасны цэс" }).getByRole("link", { name: "Хэрхэн элсэх вэ" }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.getByRole("navigation", { name: "Гар утасны цэс" })).toBeHidden();
  await page.locator("#transfer-approval summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#transfer-approval p")).toBeVisible();
  await page.goto("/trust");
  await expect(page).toHaveURL(/\/#data-access$/);
  await expect(page.locator('[data-sdy-landing="true"]')).toBeVisible();
  await page.getByRole("link", { name: "e-ID-аар нэвтрэх", exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/login\?next=%2Fmember$/);
  await expect(page.locator(".signin-card")).toBeVisible();
});

test("JavaScript унтарсан үед нүүр, FAQ болон цэс ажиллана", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  try {
    const page = await context.newPage();
    await page.goto("http://nexus.localhost:3212/");
    await expect(page.locator("h1")).toBeVisible();
    await page.locator('summary[aria-label="Цэс нээх"]').click();
    await expect(page.getByRole("navigation", { name: "Гар утасны цэс" })).toBeVisible();
    await page.locator("#dues-payment summary").click();
    await expect(page.locator("#dues-payment p")).toBeVisible();
  } finally { await context.close(); }
});
