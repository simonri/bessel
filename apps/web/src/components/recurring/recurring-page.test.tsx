// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { addDays, format } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiDate } from "@/lib/local-day";

const api = vi.hoisted(() => ({
  recurring: {
    series: [] as unknown[],
    upcoming: [] as unknown[],
    totals: [] as unknown[],
  },
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listRecurringPaymentsOptions: () => ({
    queryKey: [{ _id: "listRecurringPayments" }],
    queryFn: async () => api.recurring,
  }),
  listRecurringPaymentsQueryKey: () => [{ _id: "listRecurringPayments" }],
  listBankAccountsOptions: () => ({
    queryKey: ["accounts"],
    queryFn: async () => ({ items: [{ id: "acc", name: "Lönekonto" }] }),
  }),
  createRecurringReview: api.create,
  updateRecurringReview: api.update,
  deleteRecurringReview: api.remove,
}));

const { RecurringPage } = await import("./recurring-page");
const { BillsBlock } = await import("@/components/today/today-page");

const day = (offset: number) =>
  apiDate(format(addDays(new Date(), offset), "yyyy-MM-dd"));

function series(name: string, fields: Record<string, unknown> = {}) {
  return {
    key: `debit|SEK|personal|${name.toLowerCase()}`,
    review_id: null,
    decision: null,
    name,
    detected_name: name,
    kind: "bill",
    cadence: "monthly",
    currency: "SEK",
    direction: "debit",
    is_business: false,
    bank_account_id: "acc",
    logo_url: null,
    typical_amount: 45_000,
    variable: false,
    monthly_amount: 45_000,
    count: 5,
    first_date: day(-150),
    last_date: day(-25),
    last_amount: 45_000,
    status: "active",
    next_date: day(5),
    next_amount: 45_000,
    price_changes: [],
    ...fields,
  };
}

function upcoming(
  name: string,
  offset: number,
  fields: Record<string, unknown> = {},
) {
  return {
    key: `debit|SEK|personal|${name.toLowerCase()}`,
    typical_amount: 45_000,
    name,
    kind: "bill",
    date: day(offset),
    amount: 45_000,
    currency: "SEK",
    direction: "debit",
    is_business: false,
    bank_account_id: "acc",
    late: false,
    ...fields,
  };
}

function mount(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
  );
}

beforeEach(() => {
  api.create.mockReset().mockResolvedValue({ data: {} });
  api.update.mockReset().mockResolvedValue({ data: {} });
  api.remove.mockReset().mockResolvedValue({ data: {} });
  api.recurring = { series: [], upcoming: [], totals: [] };
});
afterEach(cleanup);

describe("RecurringPage", () => {
  it("shows subscriptions apart from bills, with the month's totals", async () => {
    api.recurring = {
      series: [
        series("Hemförsäkring"),
        series("Streamio", {
          kind: "subscription",
          typical_amount: 12_900,
          price_changes: [
            { date: day(-25), old_amount: 9_900, new_amount: 12_900 },
          ],
        }),
      ],
      upcoming: [upcoming("Hemförsäkring", 5)],
      totals: [
        {
          currency: "SEK",
          is_business: false,
          money_out: 57_900,
          subscriptions: 12_900,
          money_in: 0,
        },
      ],
    };

    mount(<RecurringPage />);

    const subscriptions = (await screen.findByText("Subscriptions")).closest(
      "section",
    );
    const bills = screen.getByText("Bills").closest("section");
    expect(
      within(subscriptions as HTMLElement).getByText("Streamio"),
    ).toBeTruthy();
    expect(
      within(subscriptions as HTMLElement).getByText(/Up from/),
    ).toBeTruthy();
    expect(
      within(bills as HTMLElement).getByText("Hemförsäkring"),
    ).toBeTruthy();
    expect(screen.getByText("1 subscription and 1 bill")).toBeTruthy();
    expect(screen.getByText("579 kr")).toBeTruthy();
    expect(
      await screen.findAllByText(/Monthly - Lönekonto - due/),
    ).toHaveLength(2);
  });

  it("dismisses a series by its key and amount", async () => {
    api.recurring = {
      series: [series("Matbutiken")],
      upcoming: [],
      totals: [],
    };
    mount(<RecurringPage />);

    const trigger = await screen.findByRole("button", {
      name: "More for Matbutiken",
    });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByText("Not recurring"));

    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0].body).toEqual({
      key: "debit|SEK|personal|matbutiken",
      typical_amount: 45_000,
      decision: "dismissed",
    });
  });

  it("changes a reviewed series rather than adding a second review", async () => {
    api.recurring = {
      series: [series("Gym", { review_id: "r1", decision: "confirmed" })],
      upcoming: [],
      totals: [],
    };
    mount(<RecurringPage />);

    const trigger = await screen.findByRole("button", { name: "More for Gym" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByText("Undo my changes"));

    await waitFor(() => expect(api.remove).toHaveBeenCalled());
    expect(api.remove.mock.calls[0][0].path).toEqual({ review_id: "r1" });
    expect(api.create).not.toHaveBeenCalled();
  });
});

describe("BillsBlock", () => {
  it("lists money out due this week and what's late", async () => {
    api.recurring = {
      series: [],
      upcoming: [
        upcoming("Elbolaget", -3, { late: true }),
        upcoming("Hemförsäkring", 2),
        upcoming("Lön", 3, { direction: "credit" }),
        upcoming("Hyra", 12),
      ],
      totals: [],
    };

    mount(<BillsBlock />);

    expect(await screen.findByText("Hemförsäkring")).toBeTruthy();
    expect(screen.getByText("Elbolaget")).toBeTruthy();
    expect(screen.getByText("Late")).toBeTruthy();
    expect(screen.queryByText("Lön")).toBeNull();
    expect(screen.queryByText("Hyra")).toBeNull();
  });

  it("is hidden when nothing is due", async () => {
    api.recurring = {
      series: [],
      upcoming: [upcoming("Hyra", 12)],
      totals: [],
    };

    const { container } = mount(<BillsBlock />);

    await waitFor(() => expect(container.innerHTML).toBe(""));
  });
});
