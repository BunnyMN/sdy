import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// The public SDY variant is selected at request time, like production.
export default defineConfig(base, {
  testDir: "./tests/landing-e2e",
  use: { baseURL: "http://nexus.localhost:3212" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start -p 3212",
    url: "http://nexus.localhost:3212/login",
    env: {
      CONTROL_PLANE_HOST: "admin.localhost",
      BRAND_SHORT_NAME: "SDY",
      BRAND_NAME: "Социал Демократ Монголын Залуучуудын Холбоо",
      BRAND_LOGO_URL: "/sdy/logo.png",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
