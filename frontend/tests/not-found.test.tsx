import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotFound from "@/app/not-found";
import { I18nProvider } from "@/lib/i18n";

describe("root not-found rendering", () => {
  it("renders when Next rejects a request without rendering the root layout", () => {
    const html = renderToString(<NotFound />);
    expect(html).toContain("<h1");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("base.error.not_found_title");
  });

  it("preserves the layout's configured copy when a provider exists", () => {
    const html = renderToString(
      <I18nProvider copy={{ "base.error.not_found_title": { mn: "Тохируулсан алдааны гарчиг" } }}>
        <NotFound />
      </I18nProvider>,
    );
    expect(html).toContain("Тохируулсан алдааны гарчиг");
  });
});
