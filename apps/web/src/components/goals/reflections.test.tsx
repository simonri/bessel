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
  reflections: [] as unknown[],
  answers: [] as { id: string; answer: string }[],
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listReflectionsQueryKey: () => ["reflections"],
  listReflectionsOptions: () => ({
    queryKey: ["reflections"],
    queryFn: async () => api.reflections,
  }),
  answerReflectionMutation: () => ({
    mutationFn: async ({
      path,
      body,
    }: {
      path: { reflection_id: string };
      body: { answer: string };
    }) => {
      api.answers.push({ id: path.reflection_id, answer: body.answer });
    },
  }),
  getGoalPlanQueryKey: () => ["goal-plan"],
  getGoalPlanOptions: () => ({
    queryKey: ["goal-plan"],
    queryFn: async () => ({ questions_per_day: 0 }),
  }),
  saveGoalPlanMutation: () => ({ mutationFn: async () => ({}) }),
}));

const { QuestionAlerts, ReflectionsSection, contextLine } = await import(
  "./reflections"
);
const { OPEN_PAGE_EVENT } = await import("@/components/pages");

const QUESTION = {
  id: "r1",
  question: "What are you avoiding right now?",
  asked_at: new Date("2026-11-04T11:00:00Z"),
  context: { hours: 2, apps: [{ app: "chromium", minutes: 84 }] },
  answer: null,
  answered_at: null,
};

class FakeNotification {
  static permission = "granted";
  static shown: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  constructor(
    public title: string,
    public options: { body?: string },
  ) {
    FakeNotification.shown.push(this);
  }
  close() {}
}

function mount(children: React.ReactNode) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {children}
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.reflections = [QUESTION];
  api.answers = [];
  FakeNotification.shown = [];
  vi.stubGlobal("Notification", FakeNotification);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("contextLine", () => {
  it("says what the computer showed, or nothing", () => {
    expect(contextLine(QUESTION.context)).toBe("Last 2 hours: chromium 84 min");
    expect(contextLine({ hours: 2, apps: [] })).toBeNull();
  });
});

describe("QuestionAlerts", () => {
  it("notifies once per question, and a click opens Goals", async () => {
    const opened: string[] = [];
    const listen = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener(OPEN_PAGE_EVENT, listen);
    mount(<QuestionAlerts />);

    await waitFor(() => expect(FakeNotification.shown).toHaveLength(1));
    const [note] = FakeNotification.shown;
    expect(note.title).toBe("What are you avoiding right now?");
    expect(note.options.body).toBe("Last 2 hours: chromium 84 min");
    note.onclick?.();
    expect(opened).toEqual(["goals"]);

    cleanup();
    mount(<QuestionAlerts />);
    await new Promise((r) => setTimeout(r, 50));
    expect(FakeNotification.shown).toHaveLength(1);
    window.removeEventListener(OPEN_PAGE_EVENT, listen);
  });
});

describe("ReflectionsSection", () => {
  it("answers an open question", async () => {
    mount(<ReflectionsSection />);
    fireEvent.change(
      await screen.findByLabelText("What are you avoiding right now?"),
      { target: { value: "The tax return" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    await waitFor(() =>
      expect(api.answers).toEqual([{ id: "r1", answer: "The tax return" }]),
    );
  });
});
