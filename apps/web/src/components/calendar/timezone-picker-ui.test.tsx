// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TimeZonePicker } from "./timezone-picker";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.scrollTo ??= () => {};
});
afterEach(cleanup);

function open(timeZone = "Europe/Stockholm") {
  const onChange = vi.fn();
  render(<TimeZonePicker timeZone={timeZone} onChange={onChange} />);
  fireEvent.click(screen.getByTitle("Change time zone"));
  return { onChange, input: screen.getByLabelText("Search time zones") };
}

describe("TimeZonePicker", () => {
  it("opens on the current zone and picks with the keyboard", () => {
    const { onChange, input } = open();
    const active = () =>
      document.querySelector("[data-active]")?.getAttribute("data-zone");
    expect(active()).toBe("Europe/Stockholm");
    expect(
      screen.getByRole("option", { selected: true }).getAttribute("data-zone"),
    ).toBe("Europe/Stockholm");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const next = active();
    expect(next).not.toBe("Europe/Stockholm");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(next);
  });

  it("searches and picks the first match with Enter", () => {
    const { onChange, input } = open();
    fireEvent.change(input, { target: { value: "new york" } });
    expect(
      screen.getAllByRole("option").map((o) => o.getAttribute("data-zone")),
    ).toEqual(["America/New_York"]);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("America/New_York");
  });

  it("offers the system zone first when another one is shown", () => {
    const system = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const other = system === "Asia/Tokyo" ? "Europe/Stockholm" : "Asia/Tokyo";
    const { onChange } = open(other);
    fireEvent.click(
      screen.getByRole("option", { name: /Use system time zone/ }),
    );
    expect(onChange).toHaveBeenCalledWith(system);
  });

  it("says when nothing matches", () => {
    const { input } = open();
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(screen.getByText("No time zone found.")).toBeTruthy();
  });
});
