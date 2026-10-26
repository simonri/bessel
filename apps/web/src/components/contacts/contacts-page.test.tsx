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
import { format } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  contacts: [] as unknown[],
  sources: [] as unknown[],
  sync: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  authorize: vi.fn(),
  tags: vi.fn(),
  entries: {} as Record<string, unknown[]>,
  log: vi.fn(),
  removeEntry: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock("@/components/settings-dialog", () => ({
  useOpenSettings: () => api.openSettings,
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
  updateContactMutation: () => ({ mutationFn: api.update }),
  createContactMutation: () => ({ mutationFn: api.create }),
  deleteContactMutation: () => ({ mutationFn: api.remove }),
  authorizeContactEditingMutation: () => ({ mutationFn: api.authorize }),
  updateContactTagsMutation: () => ({ mutationFn: api.tags }),
  listContactInteractionsOptions: ({
    path,
  }: {
    path: { contact_id: string };
  }) => ({
    queryKey: ["interactions", path.contact_id],
    queryFn: async () => api.entries[path.contact_id] ?? [],
  }),
  listContactInteractionsQueryKey: ({
    path,
  }: {
    path: { contact_id: string };
  }) => ["interactions", path.contact_id],
  logContactInteractionMutation: () => ({ mutationFn: api.log }),
  deleteContactInteractionMutation: () => ({ mutationFn: api.removeEntry }),
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
  name_prefix: null,
  middle_name: null,
  name_suffix: null,
  dates: [],
  tags: [],
  last_seen: null,
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
  api.entries = {};
  for (const fn of [
    api.sync,
    api.update,
    api.create,
    api.remove,
    api.authorize,
    api.tags,
    api.log,
    api.removeEntry,
  ])
    fn.mockReset();
  api.sync.mockResolvedValue(undefined);
  api.sources = [
    {
      id: "s1",
      email: "me@gmail.com",
      synced_at: new Date(),
      sync_error: null,
      can_edit: true,
    },
  ];
  api.contacts = [
    contact("c1", "Anna Berg", {
      organization: "Acme",
      phones: [
        { label: "Mobile", value: "+46701234567", display: "070-123 45 67" },
      ],
      emails: [
        { label: null, value: "anna@example.com", display: "anna@example.com" },
      ],
      addresses: [
        {
          label: "Home",
          value: "Storgatan 1, Lund",
          display: "Storgatan 1, Lund",
        },
      ],
    }),
    contact("c2", "Bo Ek", {
      phones: [
        { label: null, value: "+46731234567", display: "073-123 45 67" },
      ],
    }),
  ];
});
afterEach(cleanup);

describe("ContactsPage", () => {
  it("syncs on opening and lists people under their letter", async () => {
    mount();

    await screen.findByText("Anna Berg");
    expect(screen.getByText("073-123 45 67")).toBeTruthy();
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
      screen.getByRole("link", { name: "070-123 45 67" }).getAttribute("href"),
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
        .getByRole("link", { name: /Open in Google Contacts/ })
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
    fireEvent.click(screen.getByRole("button", { name: "Connect Google" }));
    expect(api.openSettings).toHaveBeenCalledWith("integrations");
  });

  it("edits a contact, sending only what changed, and shows what Google stored", async () => {
    api.update.mockImplementation(async ({ body }) => ({
      ...(api.contacts[0] as object),
      nickname: body.nickname,
    }));
    mount();
    fireEvent.click(await screen.findByText("Anna Berg"));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Nickname"), {
      target: { value: "Nana" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    expect(api.update.mock.calls[0][0]).toMatchObject({
      path: { contact_id: "c1" },
      body: { nickname: "Nana" },
    });
    expect(Object.keys(api.update.mock.calls[0][0].body)).toEqual(["nickname"]);
    expect(await screen.findByText('"Nana"')).toBeTruthy();
  });

  it("closes the editor without asking Google when nothing changed", async () => {
    mount();
    fireEvent.click(await screen.findByText("Anna Berg"));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("asks Google for permission when the account can only be read", async () => {
    api.sources = [
      {
        id: "s1",
        email: "me@gmail.com",
        synced_at: new Date(),
        sync_error: null,
        can_edit: false,
      },
    ];
    api.authorize.mockResolvedValue({
      url: "https://accounts.google.com/o/oauth2/v2/auth?scope=contacts",
    });
    const popup = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    mount();
    fireEvent.click(await screen.findByText("Anna Berg"));

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New contact" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Allow editing from Bessel" }),
    );

    await waitFor(() =>
      expect(popup.location.href).toContain("accounts.google.com"),
    );
    expect(api.authorize.mock.calls[0][0]).toMatchObject({
      path: { source_id: "s1" },
    });
  });

  it("adds a contact to the editable address book and opens it", async () => {
    api.create.mockImplementation(async ({ body }) =>
      contact("c9", body.given_name),
    );
    mount();
    await screen.findByText("Anna Berg");

    fireEvent.click(screen.getByRole("button", { name: "New contact" }));
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Cia" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add contact" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0][0].body).toEqual({
      given_name: "Cia",
      source_id: "s1",
    });
    expect(await screen.findByRole("heading", { name: "Cia" })).toBeTruthy();
  });

  it("deletes a contact only after confirming", async () => {
    api.remove.mockResolvedValue(undefined);
    mount();
    fireEvent.click(await screen.findByText("Bo Ek"));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.remove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.remove).toHaveBeenCalledTimes(1));
    expect(api.remove.mock.calls[0][0]).toMatchObject({
      path: { contact_id: "c2" },
    });
    await waitFor(() => expect(screen.queryByText("Bo Ek")).toBeNull());
  });

  describe("the log", () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const utcDay = (iso: string) => new Date(`${iso}T00:00:00Z`);
    const entry = (extra: Record<string, unknown>) => ({
      id: "e1",
      occurred_on: utcDay(today),
      kind: "met",
      source: "manual",
      note: null,
      event_title: null,
      ...extra,
    });

    it("logs what happened, of the kind picked, and shows it in the timeline", async () => {
      api.log.mockImplementation(async ({ path, body }) => {
        const added = entry({ id: "e9", kind: body.kind, note: body.note });
        api.entries[path.contact_id] = [added];
        return added;
      });
      mount();
      fireEvent.click(await screen.findByText("Anna Berg"));

      fireEvent.click(screen.getByRole("button", { name: "Call" }));
      fireEvent.change(screen.getByLabelText("What happened?"), {
        target: { value: "  Moving to Berlin " },
      });
      fireEvent.click(screen.getByRole("button", { name: "Log" }));

      await waitFor(() => expect(api.log).toHaveBeenCalledTimes(1));
      expect(api.log.mock.calls[0][0]).toMatchObject({
        path: { contact_id: "c1" },
        body: { kind: "call", note: "Moving to Berlin" },
      });
      const timeline = await screen.findByRole("list", { name: "Timeline" });
      expect(within(timeline).getByText("Moving to Berlin")).toBeTruthy();
      expect(
        (screen.getByLabelText("What happened?") as HTMLTextAreaElement).value,
      ).toBe("");
    });

    it("logs a plain meeting when nothing is written", async () => {
      api.log.mockResolvedValue(entry({}));
      mount();
      fireEvent.click(await screen.findByText("Anna Berg"));

      fireEvent.click(screen.getByRole("button", { name: "Log" }));

      await waitFor(() => expect(api.log).toHaveBeenCalledTimes(1));
      expect(api.log.mock.calls[0][0].body).toEqual({
        kind: "met",
        note: null,
      });
    });

    it("deletes logged entries but not calendar events", async () => {
      api.entries.c1 = [
        entry({ id: "e1", note: "Coffee" }),
        entry({
          id: null,
          kind: "event",
          source: "calendar",
          event_title: "Anna Berg 1:1",
          occurred_on: utcDay("2020-01-01"),
        }),
      ];
      api.removeEntry.mockResolvedValue(undefined);
      mount();
      fireEvent.click(await screen.findByText("Anna Berg"));

      const timeline = await screen.findByRole("list", { name: "Timeline" });
      expect(within(timeline).getByText(/from your calendar/)).toBeTruthy();
      const deletes = within(timeline).getAllByRole("button", {
        name: "Delete entry",
      });
      expect(deletes).toHaveLength(1);
      fireEvent.click(deletes[0]);

      await waitFor(() => expect(api.removeEntry).toHaveBeenCalledTimes(1));
      expect(api.removeEntry.mock.calls[0][0]).toMatchObject({
        path: { contact_id: "c1", interaction_id: "e1" },
      });
    });

    it("says how they were last seen", async () => {
      api.contacts[0] = contact("c1", "Anna Berg", {
        last_seen: { on: utcDay(today), kind: "call", summary: "Boat" },
      });
      mount();
      fireEvent.click(await screen.findByText("Anna Berg"));

      expect(screen.getByText("Called today - Boat")).toBeTruthy();
    });

    it("shows other dates from the address book", async () => {
      api.contacts[0] = contact("c1", "Anna Berg", {
        dates: [{ label: "Anniversary", month: 6, day: 1, year: 2015 }],
      });
      mount();
      fireEvent.click(await screen.findByText("Anna Berg"));

      expect(screen.getByRole("heading", { name: "Anniversary" })).toBeTruthy();
      expect(screen.getByText("1 June 2015")).toBeTruthy();
    });

    it("adds and removes tags, and filters the list by one", async () => {
      api.contacts[1] = contact("c2", "Bo Ek", { tags: ["Lund"] });
      api.tags.mockImplementation(async ({ path, body }) => ({
        ...(api.contacts.find(
          (c) => (c as { id: string }).id === path.contact_id,
        ) as object),
        tags: body.tags,
      }));
      mount();
      fireEvent.click(await screen.findByText("Anna Berg"));

      const input = screen.getByLabelText("Add tag");
      fireEvent.change(input, { target: { value: " Climbing " } });
      fireEvent.keyDown(input, { key: "Enter" });
      await waitFor(() => expect(api.tags).toHaveBeenCalledTimes(1));
      expect(api.tags.mock.calls[0][0].body).toEqual({ tags: ["Climbing"] });
      fireEvent.click(
        await screen.findByRole("button", { name: "Remove Climbing" }),
      );
      await waitFor(() => expect(api.tags).toHaveBeenCalledTimes(2));
      expect(api.tags.mock.calls[1][0].body).toEqual({ tags: [] });

      const filters = screen.getByRole("group", { name: "Filter contacts" });
      fireEvent.click(within(filters).getByRole("button", { name: "Lund" }));
      const list = screen.getByRole("complementary");
      expect(within(list).queryByText("Anna Berg")).toBeNull();
      expect(within(list).getByText("Bo Ek")).toBeTruthy();

      fireEvent.click(within(list).getByText("Bo Ek"));
      fireEvent.click(screen.getByRole("button", { name: "Remove Lund" }));
      expect(await within(list).findByText("Anna Berg")).toBeTruthy();
    });
  });
});
