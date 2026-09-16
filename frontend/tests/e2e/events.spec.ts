import { expect, test, type Page, type Route } from "@playwright/test";
import type { EventRecord, Participant } from "../../lib/api/events";

// Хөтөч дээрх үйлдэл, navigation, төлөв ба эрхийн дүрслэл. API-г энд
// stub-дана; жинхэнэ session/DB/install урсгал нь events_journey_test.go-д бий.
const member = { user_id: "member-1", name: "Тест Гишүүн", email: "member@example.test" };
const initial: EventRecord = {
  id: "event-1", title: "Салбарын уулзалт", description: "Ирцийн шалгалт", location: "Улаанбаатар",
  starts_at: "2027-10-01T02:00:00Z", ends_at: null, capacity: 2, status: "planned",
  created_by: "manager", created_at: "2026-09-10T00:00:00Z", registered: 0, attended: 0, my_status: "",
};
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function stubEvents(page: Page, manage = false, exists = true) {
  const state = { event: { ...initial }, people: [] as Participant[], exists, calls: [] as string[], rejectRegistration: false };
  function count() {
    state.event.registered = state.people.filter(p => p.status !== "absent").length;
    state.event.attended = state.people.filter(p => p.status === "attended").length;
    state.event.my_status = manage ? "" : state.people.find(p => p.user_id === member.user_id)?.status ?? "";
  }
  function participant(): Participant {
    return { ...member, status: "registered", note: "", registered_at: "2026-09-10T00:00:00Z", checked_at: null };
  }
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method();
    state.calls.push(`${method} ${path}`);
    if (path === "/auth/me") return json(route, {
      id: manage ? "manager" : member.user_id, tenant_id: "tenant-1", tenant_name: "SDY салбар",
      name: manage ? "Тест Менежер" : member.name, email: member.email, workspace_kind: "organisation",
      is_admin: false, permissions: manage ? ["events.read", "events.manage"] : ["events.read"],
    });
    if (path === "/menus") return json(route, [{
      id: "events", app_id: "mn.sdy.events", app_name: "Арга хэмжээ", label: "Арга хэмжээ",
      path: "/module/events", icon: "calendar-days", order: 10,
    }]);
    if (path === "/auth/tenants") return json(route, { current: "tenant-1", active: ["tenant-1"], tenants: [{ id: "tenant-1", name: "SDY салбар", slug: "sdy", kind: "organisation" }] });
    if (path === "/events") {
      if (method === "POST") {
        state.event = { ...state.event, ...route.request().postDataJSON() };
        state.exists = true;
        return json(route, state.event, 201);
      }
      return json(route, { events: state.exists ? [state.event] : [] });
    }
    if (path === "/events/members") return json(route, { members: [member] });
    if (path === "/events/event-1") {
      if (method === "PUT") state.event = { ...state.event, ...route.request().postDataJSON() };
      return json(route, state.event);
    }
    if (path === "/events/event-1/register") {
      if (state.rejectRegistration) return json(route, { error: "this event is full" }, 409);
      state.people = method === "DELETE" ? [] : [participant()];
      count();
      return json(route, { status: state.event.my_status, changed: true });
    }
    if (path === "/events/event-1/attendance") {
      if (method === "POST") { state.people = [participant()]; count(); return json(route, { status: "registered" }); }
      return json(route, { participants: state.people });
    }
    if (path === "/events/event-1/attendance/member-1" && method === "PUT") {
      state.people[0] = { ...state.people[0], ...route.request().postDataJSON() };
      count();
      return json(route, { status: state.people[0].status });
    }
    return json(route, {});
  });
  return state;
}

function origin(baseURL: string) {
  return `http://nexus.localhost:${new URL(baseURL).port}`;
}

test("үл мэдэгдэх Server Action нь 404 хариулна", async ({ request, baseURL }) => {
  const response = await request.post(`${origin(baseURL!)}/`, {
    headers: { "Next-Action": "00".repeat(20), "Content-Type": "text/plain;charset=UTF-8" },
    data: "[]",
  });
  expect(response.status()).toBe(404);
});

test("гишүүн бүртгүүлж цуцлах бөгөөд хаагдсан арга хэмжээг өөрчлөх үйлдэлгүй", async ({ page, baseURL }) => {
  const state = await stubEvents(page);
  await page.goto(`${origin(baseURL!)}/module/events`);
  await expect(page.getByRole("button", { name: "Арга хэмжээ нэмэх" })).toHaveCount(0);
  await page.getByRole("link", { name: /Салбарын уулзалт/ }).click();
  await page.getByRole("button", { name: "Бүртгүүлэх", exact: true }).click();
  await expect(page.getByRole("button", { name: "Бүртгэлээ цуцлах" })).toBeVisible();
  await expect(page.getByText(member.name, { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Ирсэн", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Бүртгэлээ цуцлах" }).click();
  await expect(page.getByRole("button", { name: "Бүртгүүлэх", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Бүртгүүлэх", exact: true }).click();
  await expect(page.getByRole("button", { name: "Бүртгэлээ цуцлах" })).toBeVisible();
  for (const status of ["done", "cancelled"] as const) {
    state.event.status = status;
    await page.reload();
    await expect(page.getByRole("heading", { name: initial.title, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Бүртгэлээ цуцлах" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Бүртгүүлэх", exact: true })).toHaveCount(0);
  }
  expect(state.calls.filter(x => x === "DELETE /events/event-1/register")).toHaveLength(1);
});

test("менежер арга хэмжээ үүсгэж, оролцогч нэмэн ирц тэмдэглээд хаана", async ({ page, baseURL }) => {
  const state = await stubEvents(page, true, false);
  await page.goto(`${origin(baseURL!)}/module/events`);
  await page.getByRole("button", { name: "Арга хэмжээ нэмэх" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Нэр", { exact: true }).fill("Шинэ уулзалт");
  await dialog.getByLabel("Эхлэх", { exact: true }).fill("2027-10-01T10:00");
  await dialog.getByLabel(/Хүний дээд тоо/).fill("2");
  await dialog.getByRole("button", { name: "Хадгалах" }).click();
  await page.getByRole("link", { name: /Шинэ уулзалт/ }).click();
  await page.getByRole("button", { name: "Оролцогч нэмэх" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Гишүүн", { exact: true }).selectOption(member.user_id);
  await dialog.getByRole("button", { name: "Нэмэх", exact: true }).click();
  await page.getByRole("button", { name: "Ирсэн", exact: true }).click();
  await expect(page.getByRole("button", { name: "Буцаах", exact: true })).toBeVisible();
  expect(state.people[0].status).toBe("attended");
  await page.getByRole("button", { name: "Ирээгүй", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Хадгалах", exact: true })).toBeDisabled();
  await dialog.getByLabel("Өөрчлөлтийн шалтгаан", { exact: true }).fill("Зохион байгуулагчийн залруулга");
  await dialog.getByRole("button", { name: "Хадгалах", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.people[0].status).toBe("absent");
  expect(state.people[0].note).toBe("Зохион байгуулагчийн залруулга");
  await page.getByRole("button", { name: "Засах", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Төлөв", { exact: true }).selectOption("done");
  await dialog.getByRole("button", { name: "Хадгалах" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.event.status).toBe("done");
  await expect(page.getByRole("button", { name: "Бүртгүүлэх", exact: true })).toHaveCount(0);
});

test("сүүлийн суудал дүүрсэн алдаа гишүүнийг бүртгэгдсэн гэж харуулахгүй", async ({ page, baseURL }) => {
  const state = await stubEvents(page);
  state.rejectRegistration = true;
  await page.goto(`${origin(baseURL!)}/module/events/event-1`);
  await page.getByRole("button", { name: "Бүртгүүлэх", exact: true }).click();
  await expect(page.getByText("this event is full", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Бүртгэлээ цуцлах" })).toHaveCount(0);
  expect(state.people).toHaveLength(0);
});
