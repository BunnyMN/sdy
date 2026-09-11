import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import InstallApp from "@/components/InstallApp";

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/brandContext", () => ({ useBrand: () => ({ iconUrl: "/sdy/icon-512.png" }) }));
vi.mock("@/lib/deviceLine", () => ({ currentDeviceLine: () => null }));

beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: false, media: query }) as MediaQueryList);
});

function offer(outcome: "accepted" | "dismissed" = "accepted") {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt, userChoice: Promise.resolve({ outcome }),
  });
  act(() => { window.dispatchEvent(event); });
  return prompt;
}

test("blocked storage still allows installing the branded PWA", async () => {
  vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new DOMException("Storage blocked", "SecurityError"); });
  const view = render(<InstallApp />);
  const prompt = offer();
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe("/sdy/icon-512.png");
  fireEvent.click(screen.getByRole("button", { name: "pwa.install.action" }));
  await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByRole("button", { name: "pwa.install.action" })).toBeNull());
});

test("closing the offer works when preferences cannot be saved", () => {
  vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("Storage blocked", "SecurityError"); });
  render(<InstallApp />);
  const prompt = offer();
  fireEvent.click(screen.getByRole("button", { name: "base.action.close" }));
  expect(screen.queryByRole("button", { name: "pwa.install.action" })).toBeNull();
  expect(prompt).not.toHaveBeenCalled();
});

test("dismissing the browser prompt handles blocked preferences", async () => {
  vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("Storage blocked", "SecurityError"); });
  render(<InstallApp />);
  offer("dismissed");
  fireEvent.click(screen.getByRole("button", { name: "pwa.install.action" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "pwa.install.action" })).toBeNull());
});
