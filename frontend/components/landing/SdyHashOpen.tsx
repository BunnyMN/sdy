"use client";

import { useEffect } from "react";

/**
 * Opens the FAQ answer an address points at.
 *
 * "Мэдээлэл ба эрх" in the footer — and /trust, which now redirects here — lead
 * to #data-access, a closed <details>. The browser scrolls to it and leaves it
 * shut, so the visitor lands on a question with no answer. This opens it, on
 * arrival and on every later jump, and renders nothing.
 */
export default function SdyHashOpen() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      if (target instanceof HTMLDetailsElement && !target.open) {
        target.open = true;
        target.scrollIntoView({ block: "start" });
      }
    };
    // A click on a link to the hash already in the address fires no hashchange.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href^='#']");
      if (link && link.getAttribute("href") === window.location.hash) window.setTimeout(open, 0);
    };
    open();
    window.addEventListener("hashchange", open);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", open);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
