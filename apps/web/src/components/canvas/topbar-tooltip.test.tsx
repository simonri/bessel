// @vitest-environment jsdom
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { TooltipProvider } from "@bessel/ui/components/tooltip";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TopbarTooltip } from "./topbar-tooltip";

afterEach(cleanup);

it("still opens the popover it sits inside", () => {
  render(
    <TooltipProvider>
      <Popover>
        <PopoverTrigger asChild>
          <TopbarTooltip label="Account">
            <button type="button">Avatar</button>
          </TopbarTooltip>
        </PopoverTrigger>
        <PopoverContent>Log out</PopoverContent>
      </Popover>
    </TooltipProvider>,
  );

  const trigger = screen.getByRole("button", { name: "Avatar" });
  fireEvent.click(trigger);

  expect(screen.getByText("Log out")).toBeTruthy();
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
});
