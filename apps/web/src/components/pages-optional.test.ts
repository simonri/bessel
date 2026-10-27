import { afterEach, describe, expect, it, vi } from "vitest";

async function pagesOn(desktop: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/environment", () => ({ isDesktop: desktop }));
  return import("./pages");
}

afterEach(() => vi.doUnmock("@/lib/environment"));

describe("optional pages", () => {
  it("include the canvas in a browser", async () => {
    const { isOptionalPage, OPTIONAL_PAGES } = await pagesOn(false);
    expect(isOptionalPage("canvas")).toBe(true);
    expect(OPTIONAL_PAGES).toContain("canvas");
  });

  it("leave the canvas alone in the desktop app", async () => {
    const { isOptionalPage, OPTIONAL_PAGES } = await pagesOn(true);
    expect(isOptionalPage("canvas")).toBe(false);
    expect(OPTIONAL_PAGES).not.toContain("canvas");
    expect(isOptionalPage("sleep")).toBe(true);
  });
});
