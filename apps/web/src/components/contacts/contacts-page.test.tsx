// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  contacts: [] as unknown[],
  sources: [] as unknown[],
  sync: vi.fn(),
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listContacts: async () => ({
    data: {
      items: api.contacts,
      pagination: { total_count: api.contacts.length, max_page: 1 },
    },
  }),
  listContactSources: async () => ({ data: api.sources }),
  syncContactsMutation: () => ({ mutationFn: api.sync }),
}));

const { ContactsPage } = await import("./contacts-page");

const contact = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  source_id: "s1",
  display_name: name,
  given_name: null,
  family_name: null,
  nickname: null,
  organization: null,
  job_title: null,
  birthday: null,
  photo_url: null,
  notes: null,
  external_url: `https://contacts.google.com/person/${id}`,
  phones: [],
  emails: [],
  addresses: [],
  urls: [],
  created_at: new Date(),
  modified_at: null,
  ...extra,
});

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContactsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.sync.mockReset();
  api.sync.mockResolvedValue(undefined);
  api.sources = [
    {
      id: "s1",
      email: "me@gmail.com",
      synced_at: new Date(),
      sync_error: null,
    },
  ];
  api.contacts = [
    contact("c1", "Anna Berg", {
      organization: "Acme",
      phones: [{ label: "Mobile", value: "+46 70 123 45 67" }],
      emails: [{ label: null, value: "anna@example.com" }],
      addresses: [{ label: "Home", value: "Storgatan 1, Lund" }],
    }),
    contact("c2", "Bo Ek"),
  ];
});
afterEach(cleanup);

describe("ContactsPage", () => {
  it("syncs on opening and lists people under their letter", async () => {
    mount();

    await screen.findByText("Anna Berg");
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText(/2 contacts - synced/)).toBeTruthy();
    expect(api.sync).toHaveBeenCalledTimes(1);
  });

  it("searches and shows the person with links to call, write and find them", async () => {
    mount();
    await screen.findByText("Anna Berg");

    fireEvent.change(screen.getByLabelText("Search contacts"), {
      target: { value: "0701234" },
    });
    expect(screen.queryByText("Bo Ek")).toBeNull();
    fireEvent.click(screen.getByText("Anna Berg"));

    expect(
      screen.getByRole("link", { name: "Call" }).getAttribute("href"),
    ).toBe("tel:+46701234567");
    expect(
      screen
        .getByRole("link", { name: "anna@example.com" })
        .getAttribute("href"),
    ).toBe("mailto:anna@example.com");
    expect(
      screen
        .getByRole("link", { name: "Storgatan 1, Lund" })
        .getAttribute("href"),
    ).toContain("google.com/maps");
    expect(
      screen
        .getByRole("link", { name: /Edit in Google Contacts/ })
        .getAttribute("href"),
    ).toBe("https://contacts.google.com/person/c1");
    expect(screen.getByText("From me@gmail.com")).toBeTruthy();
  });

  it("shows why a sync failed instead of when it last worked", async () => {
    api.sources = [
      {
        id: "s1",
        email: "me@gmail.com",
        synced_at: new Date(),
        sync_error: "Google refused access to contacts. Reconnect the account.",
      },
    ];
    mount();

    await waitFor(() =>
      expect(screen.getByText(/Reconnect the account/)).toBeTruthy(),
    );
  });

  it("explains how to connect an address book when there is none", async () => {
    api.sources = [];
    api.contacts = [];
    mount();

    expect(await screen.findByText("No address book connected")).toBeTruthy();
  });
});
