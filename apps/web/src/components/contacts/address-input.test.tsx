// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  suggest: vi.fn(),
  details: vi.fn(),
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  suggestAddressesOptions: ({
    query,
  }: {
    query: { text: string; session: string };
  }) => ({
    queryKey: ["suggest", query],
    queryFn: () => api.suggest(query),
  }),
  getAddressOptions: ({
    path,
    query,
  }: {
    path: { place_id: string };
    query: { session: string };
  }) => ({
    queryKey: ["address", path.place_id, query.session],
    queryFn: () => api.details(path.place_id, query.session),
  }),
}));

const { AddressInput } = await import("./address-input");

const PARTS = {
  formatted: "Drottninggatan 5, 111 51 Stockholm",
  street_address: "Drottninggatan 5",
  postal_code: "111 51",
  city: "Stockholm",
  region: null,
  country: "Sverige",
  country_code: "SE",
  latitude: 59.33,
  longitude: 18.06,
};

const changes: { value: string; parts: unknown }[] = [];

function Field() {
  const [value, setValue] = useState("");
  return (
    <AddressInput
      ariaLabel="Address"
      placeholder="Street"
      value={value}
      onChange={(next, parts) => {
        changes.push({ value: next, parts });
        setValue(next);
      }}
    />
  );
}

function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Field />
    </QueryClientProvider>,
  );
  return screen.getByRole("combobox", { name: "Address" });
}

const type = (input: HTMLElement, value: string) => {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
};

beforeEach(() => {
  changes.length = 0;
  api.suggest.mockReset();
  api.details.mockReset();
  api.suggest.mockResolvedValue({
    suggestions: [
      {
        place_id: "p1",
        main_text: "Drottninggatan 5",
        secondary_text: "Stockholm, Sverige",
      },
      { place_id: "p2", main_text: "Drottninggatan 5", secondary_text: null },
    ],
  });
  api.details.mockResolvedValue(PARTS);
});
afterEach(cleanup);

describe("AddressInput", () => {
  it("suggests addresses once three characters are typed", async () => {
    const input = mount();

    type(input, "Dr");
    await new Promise((r) => setTimeout(r, 400));
    expect(api.suggest).not.toHaveBeenCalled();

    type(input, "Drottninggatan 5");
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Drottninggatan 5 Stockholm, Sverige",
      "Drottninggatan 5",
    ]);
    expect(api.suggest).toHaveBeenCalledTimes(1);
    expect(api.suggest.mock.calls[0][0].text).toBe("Drottninggatan 5");
    expect(screen.getByText("Suggestions from Google")).toBeTruthy();
  });

  it("fills in the picked address with its parts, in the same session as the suggestions", async () => {
    const input = mount();
    type(input, "Drottninggatan 5");

    fireEvent.mouseDown((await screen.findAllByRole("option"))[0]);

    await waitFor(() => expect(changes.at(-1)?.parts).toEqual(PARTS));
    expect(changes.at(-1)?.value).toBe(PARTS.formatted);
    expect(api.details.mock.calls[0]).toEqual([
      "p1",
      api.suggest.mock.calls[0][0].session,
    ]);
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("starts a new session after a pick, and typing again drops the parts", async () => {
    const input = mount();
    type(input, "Drottninggatan 5");
    fireEvent.mouseDown((await screen.findAllByRole("option"))[0]);
    await waitFor(() => expect(changes.at(-1)?.parts).toEqual(PARTS));
    const first = api.suggest.mock.calls[0][0].session;

    type(input, "Kungsgatan 1");

    expect(changes.at(-1)).toEqual({ value: "Kungsgatan 1", parts: null });
    await waitFor(() => expect(api.suggest).toHaveBeenCalledTimes(2));
    expect(api.suggest.mock.calls[1][0].session).not.toBe(first);
  });

  it("is driven from the keyboard: arrows to move, Enter to pick, Escape to close", async () => {
    const input = mount();
    type(input, "Drottninggatan 5");
    await screen.findAllByRole("option");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(api.details).toHaveBeenCalledWith("p2", expect.any(String)),
    );

    type(input, "Drottninggatan 7");
    await screen.findAllByRole("option");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("keeps the typed text when the address can't be fetched", async () => {
    api.details.mockRejectedValue(new Error("down"));
    const input = mount();
    type(input, "Drottninggatan 5");

    fireEvent.mouseDown((await screen.findAllByRole("option"))[0]);

    await waitFor(() => expect(api.details).toHaveBeenCalled());
    expect(changes.at(-1)).toEqual({ value: "Drottninggatan 5", parts: null });
    expect((input as HTMLInputElement).value).toBe("Drottninggatan 5");
  });
});
