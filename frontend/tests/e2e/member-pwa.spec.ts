import { expect, test, type Page, type Route } from "@playwright/test";

// Phone viewport and real pages; API responses are fixtures. Database/RLS and
// real sessions are exercised separately by the backend journey and dues tests.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const base = (url: string) => `http://nexus.localhost:${new URL(url).port}`;
const branches = [
  { slug: "sdy-darkhan-uul", name: "Дархан-Уул аймгийн СДМЗХ" },
  ...[
    ["darkhan", "Дархан сумын SDY"], ["orkhon", "Орхон сумын SDY"],
    ["shariin-gol", "Шарын гол сумын SDY"], ["khongor", "Хонгор сумын SDY"],
  ].map(([slug, name]) => ({ slug: `sdy-darkhan-uul-${slug}`, name, parent_slug: "sdy-darkhan-uul" })),
];

async function memberAPI(page: Page, role: "applicant" | "member" | "manager" | "admin" = "member") {
  const state = { transferStatus: "" as string, approved: false, requested: false, checked: false, payment: false, signedIn: true, calls: [] as string[] };
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method(); state.calls.push(`${method} ${path}`);
    const joined = role !== "applicant" || state.approved;
    if (path === "/auth/me") return state.signedIn ? json(route, {
      id: "member-1", tenant_id: joined ? "branch-1" : "home-1", tenant_name: "Салбар 1", name: "Тест Гишүүн", email: "test@example.test",
      workspace_kind: joined ? "organisation" : "personal", is_admin: role === "admin",
      permissions: joined ? ["events.read", "membership.read", ...(role === "manager" ? ["events.manage", "membership.manage"] : [])] : [],
    }) : json(route, { error: "unauthorized" }, 401);
    if (path === "/menus") return json(route, []);
    if (path === "/profile") return json(route, { id: "member-1", name: "Тест Гишүүн", email: "test@example.test", identities: [], organisations: joined ? [{ id: "branch-1", slug: branches[0].slug, name: branches[0].name }] : [], active_sessions: 1 });
    if (path === "/auth/tenants") return json(route, { current: joined ? "branch-1" : "home-1", active: [], tenants: [] });
    const transfer = { id: "transfer-1", from_tenant_id: "branch-1", from_name: branches[0].name, tenant_id: "branch-2", to_name: branches[1].name, name: "Шилжих Гишүүн", email: "transfer@example.test", message: "Хаяг өөрчлөгдсөн", status: state.transferStatus, created_at: "2026-09-11T01:00:00Z" };
    if (path === "/me/transfers" && method === "POST") { expect(route.request().postDataJSON()).toMatchObject({ from_tenant_id: "branch-1", slug: branches[1].slug, message: "Хаяг өөрчлөгдсөн" }); state.transferStatus = "PENDING"; return json(route, { ok: true, id: "transfer-1" }); }
    if (path === "/me/transfers") return json(route, { requests: state.transferStatus ? [transfer] : [] });
    if (path === "/me/transfers/transfer-1/cancel") { state.transferStatus = "CANCELLED"; return json(route, { ok: true }); }
    if (path === "/membership/transfers") return json(route, { requests: state.transferStatus === "PENDING" ? [transfer] : [] });
    if (path === "/membership/transfers/transfer-1") { state.transferStatus = route.request().postDataJSON().accept ? "ACCEPTED" : "DECLINED"; return json(route, { ok: true }); }
    if (path === "/me/branches") return json(route, { branches });
    if (path === "/me/items") return json(route, { items: state.requested ? [{ id: "request-1", provider: branches[0].name, code: "join_request", status: state.approved ? "accepted" : "pending", answer: "" }] : [] });
    if (path === "/me/branch-requests") { expect(route.request().postDataJSON().slug).toBe(branches[0].slug); state.requested = true; return json(route, { ok: true, joined: false }); }
    if (path === "/membership/join-requests") return json(route, { requests: state.approved ? [] : [{ id: "request-1", name: "Шинэ Гишүүн", email: "new@example.test", message: "Элсэх хүсэлт" }] });
    if (path === "/membership/join-requests/request-1") { state.approved = true; return json(route, { ok: true }); }
    if (path === "/events/event-1") return json(route, { id: "event-1", title: "Салбарын уулзалт", location: "Танхим", status: "planned", points_value: 10, my_status: "registered" });
    if (path === "/events/event-1/check-in") { expect(route.request().postDataJSON().token).toBe("a".repeat(48)); state.checked = true; return json(route, { changed: true, status: "attended" }); }
    if (path === "/events/mine") return json(route, { items: state.checked ? [{ event_id: "event-1", title: "Салбарын уулзалт", status: "attended", points: 10 }] : [], has_more: false, next_offset: 50 });
    if (path === "/events/points") return json(route, { total: state.checked ? 10 : 0, entries: [], has_more: false, next_offset: 50 });
    if (path === "/dues/settings") return json(route, { enabled: true, monthly_amount: 10000, due_day: 15, bank_name: "Тест банк", account_number: "TEST-ONLY", account_holder: "Салбар 1", instructions: "Туршилтын заавар" });
    if (path === "/dues/mine") return json(route, {
      charges: [{ id: "charge-1", user_id: "member-1", period: "2026-09", amount: 10000, paid: 0, balance: 10000, due_date: "2026-09-15", waived: false }],
      payments: state.payment ? [{ id: "payment-1", charge_id: "charge-1", amount: 10000, reference: "TEST-123", status: "pending", created_at: "2026-09-10T01:00:00Z" }] : [], has_more: false, next_offset: 50,
    });
    if (path === "/dues/payments") { expect(route.request().postDataJSON()).toMatchObject({ charge_id: "charge-1", amount: 10000, reference: "TEST-123" }); state.payment = true; return json(route, { id: "payment-1", changed: true }, 201); }
    if (path === "/auth/sso/config") return json(route, { enabled: false, local_login: true, eid: { enabled: true } });
    return json(route, {});
  });
  return state;
}

test("утсан дээр Дархан-Уул ба дөрвөн сумын бүтцээс элсэх хүсэлт өгнө", async ({ page, baseURL }) => {
  const state = await memberAPI(page, "applicant");
  await page.goto(`${base(baseURL!)}/member`);
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("combobox").locator("option")).toHaveCount(6);
  await expect(page.locator('optgroup[label="Дархан-Уул аймгийн СДМЗХ"] option')).toHaveCount(5);
  await page.getByRole("combobox", { name: "Салбар байгууллага", exact: true }).selectOption(branches[0].slug);
  await page.getByLabel("Нэмэлт тайлбар").fill("Өөрийн салбарт элсэх хүсэлттэй.");
  await page.getByRole("button", { name: "Элсэх хүсэлт илгээх" }).click();
  await expect(page.getByText("Шийдвэр хүлээж байна", { exact: true })).toBeVisible();
  expect(state.requested).toBe(true);
  await expect(page.getByRole("link", { name: "Миний хураамж", exact: true })).toHaveCount(0);
  state.approved = true;
  await page.reload();
  await expect(page.getByText("Идэвхтэй салбар", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Миний хураамж", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("менежер утаснаас элсэх хүсэлтийг батална", async ({ page, baseURL }) => {
  const state = await memberAPI(page, "manager");
  await page.goto(`${base(baseURL!)}/member/requests`);
  await expect(page.getByRole("heading", { name: "Шинэ Гишүүн" })).toBeVisible();
  await page.getByRole("button", { name: "Батлах", exact: true }).click();
  await expect(page.getByText("Хүлээгдэж буй хүсэлт алга.")).toBeVisible();
  expect(state.approved).toBe(true);
});

test("QR холбоосоор ирцээ батлаад хувийн оноогоо харна", async ({ page, baseURL }) => {
  const state = await memberAPI(page);
  await page.goto(`${base(baseURL!)}/member/check-in#event=event-1&token=${"a".repeat(48)}`);
  await expect(page.getByRole("heading", { name: "Салбарын уулзалт" })).toBeVisible();
  await expect(page).toHaveURL(/\/member\/check-in$/);
  await page.getByRole("button", { name: "Би ирсэн — батлах" }).click();
  expect(state.checked).toBe(true);
  await page.getByRole("link", { name: "Миний ирц ба оноо", exact: true }).click();
  await expect(page.getByText("10", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Салбарын уулзалт/ })).toBeVisible();
});

test("нэвтрэх шаардлагатай QR холбоос нэвтэрсний дараа үргэлжилнэ", async ({ page, baseURL }) => {
  const state = await memberAPI(page); state.signedIn = false;
  await page.goto(`${base(baseURL!)}/member/check-in#event=event-1&token=${"a".repeat(48)}`);
  await expect(page).toHaveURL(/\/login\?next=%2Fmember%2Fcheck-in$/);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("sdy.checkin") || "null"));
  expect(saved.fragment).toContain("event=event-1");
  // The identity provider owns interactive authentication; resume the same
  // browser session here with its verified identity fixture.
  state.signedIn = true;
  await page.goto(`${base(baseURL!)}/member/check-in`);
  await expect(page.getByRole("heading", { name: "Салбарын уулзалт" })).toBeVisible();
  await page.getByRole("button", { name: "Би ирсэн — батлах" }).click();
  expect(state.checked).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem("sdy.checkin"))).toBeNull();
});

test("шилжүүлгээ мэдээлэх нь төлсөн гэж шууд тооцохгүй", async ({ page, baseURL }) => {
  await memberAPI(page);
  await page.goto(`${base(baseURL!)}/member/dues`);
  await expect(page.getByText("TEST-ONLY", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Шилжүүлгээ мэдээлэх", exact: true }).click();
  await page.getByLabel("Банкны гүйлгээний дугаар").fill("TEST-123");
  await page.locator("form").getByRole("button", { name: "Шилжүүлгээ мэдээлэх", exact: true }).click();
  await expect(page.getByText("Баталгаажуулалт хүлээж байна", { exact: true })).toBeVisible();
  await expect(page.getByText(/Төлсөн: 0₮/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Хураамжийн санхүү", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("PWA нь гишүүний нүүрээр эхэлж, хувийн мэдээллийг offline хадгалахгүй", async ({ page, context, baseURL, request }) => {
  const origin = base(baseURL!);
  const response = await request.get(`${origin}/manifest.webmanifest`);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ id: "/", start_url: "/member", display: "standalone", scope: "/" });
  expect(manifest.icons.length).toBeGreaterThan(0);
  await memberAPI(page);
  await page.goto(`${origin}/member`);
  await expect(page.locator("h1")).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const cached = await page.evaluate(async () => { const urls: string[] = []; for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) urls.push(new URL(req.url).pathname); return urls; });
  expect(cached.some(path => path.startsWith("/api/") || path.startsWith("/member"))).toBe(false);
  await context.setOffline(true);
  await page.goto(`${origin}/member/participation`);
  await expect(page.locator("body")).toContainText(/сүлжээ|offline|интернет/i);
});


test("гишүүн шилжих хүсэлт илгээж, хүлээгдэж байхад цуцалж чадна", async ({ page, baseURL }) => {
  const state = await memberAPI(page);
  await page.goto(`${base(baseURL!)}/member`);
  await page.getByRole("button", { name: "Өөр салбарт шилжих", exact: true }).click();
  await page.getByRole("combobox", { name: "Шилжиж очих байгууллага", exact: true }).selectOption(branches[1].slug);
  await page.getByLabel("Шилжих шалтгаан", { exact: true }).fill("Хаяг өөрчлөгдсөн");
  await page.getByRole("button", { name: "Шилжих хүсэлт илгээх", exact: true }).click();
  await expect(page.getByText("Очих байгууллагын админы шийдвэр хүлээж байна", { exact: true })).toBeVisible();
  await expect(page.getByText("Идэвхтэй салбар", { exact: true })).toBeVisible();
  expect(state.transferStatus).toBe("PENDING");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Хүсэлтээ цуцлах", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Хүсэлтээ цуцлах", exact: true }).click();
  await expect(page.getByText("Шилжих хүсэлт цуцлагдсан", { exact: true })).toBeVisible();
  expect(state.transferStatus).toBe("CANCELLED");
});

test("очих байгууллагын админ шилжих хүсэлтийг утаснаас батална", async ({ page, baseURL }) => {
  const state = await memberAPI(page, "admin"); state.transferStatus = "PENDING";
  await page.goto(`${base(baseURL!)}/member`);
  await page.getByRole("link", { name: "Шилжих хүсэлтүүд", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Шилжих Гишүүн" })).toBeVisible();
  await page.getByRole("button", { name: "Батлах", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Батлах", exact: true }).click();
  await expect(page.getByText("Хүлээгдэж буй хүсэлт алга.")).toBeVisible();
  expect(state.transferStatus).toBe("ACCEPTED");
});

test("менежерт шилжилт шийдвэрлэх дэлгэц нээгдэхгүй", async ({ page, baseURL }) => {
  const state = await memberAPI(page, "manager");
  await page.goto(`${base(baseURL!)}/member`);
  await expect(page.getByRole("link", { name: "Элсэх хүсэлтүүд", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Шилжих хүсэлтүүд", exact: true })).toHaveCount(0);
  await page.goto(`${base(baseURL!)}/member/transfers`);
  await expect(page.getByText("Зөвхөн очих байгууллагын админ шийдвэр гаргана.")).toBeVisible();
  expect(state.calls.some(call => call.includes("/membership/transfers"))).toBe(false);
});

test("гишүүний UI нь Gerege-ийн хэмжээс, dark mode болон жижиг дэлгэцийг дэмжинэ", async ({ page, baseURL }, testInfo) => {
  await memberAPI(page);
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base(baseURL!)}/member`);
    await expect(page.getByRole("heading", { name: "Миний гишүүнчлэл", exact: true })).toBeVisible();
    await expect(page.locator(".sdy-action-list").first()).toBeVisible();
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark);
      const dimensions = await page.evaluate(() => {
        const shell = document.querySelector(".sdy-member-shell")!;
        const list = document.querySelector(".sdy-action-list")!;
        const main = document.querySelector(".sdy-member-main > div:last-child")!;
        return { overflow: document.documentElement.scrollWidth > innerWidth, radius: getComputedStyle(list).borderRadius, font: getComputedStyle(shell).fontSize, mainWidth: main.getBoundingClientRect().width };
      });
      expect(dimensions).toMatchObject({ overflow: false, radius: "8px", font: "14px" });
      expect(dimensions.mainWidth).toBeLessThanOrEqual(720);
      if (width <= 1024) {
        await expect(page.locator(".sdy-member-sidebar")).toBeHidden();
        await expect(page.locator(".sdy-member-tabs a")).toHaveCount(5);
        const targets = await page.locator(".sdy-member-tabs a").evaluateAll(links => links.map(link => ({ width: link.getBoundingClientRect().width, height: link.getBoundingClientRect().height })));
        expect(targets.every(target => target.width >= 44 && target.height >= 44)).toBe(true);
      } else {
        await expect(page.locator(".sdy-member-sidebar")).toBeVisible();
        await expect(page.locator(".sdy-member-tabs")).toBeHidden();
      }
      await page.screenshot({ path: testInfo.outputPath(`member-${width}-${dark ? "dark" : "light"}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole("button", { name: "Өөр салбарт шилжих", exact: true }).click();
  expect(await page.getByRole("combobox", { name: "Шилжиж очих байгууллага", exact: true }).evaluate(input => getComputedStyle(input).fontSize)).toBe("16px");
  await page.getByRole("link", { name: "Миний хураамж", exact: true }).click();
  await expect(page).toHaveTitle(/Миний хураамж/);
  await expect(page.locator("h1")).toBeFocused();
  await expect(page.getByRole("link", { name: "Буцах", exact: true })).toBeVisible();
});
