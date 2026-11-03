import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  total: 0,
  pages: [] as { page: number; limit: number; search?: string }[],
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listTransactions: async ({
    query,
  }: {
    query: { page: number; limit: number; search?: string };
  }) => {
    api.pages.push({
      page: query.page,
      limit: query.limit,
      search: query.search,
    });
    const start = (query.page - 1) * query.limit;
    const items = Array.from(
      { length: Math.max(0, Math.min(query.limit, api.total - start)) },
      (_, i) => ({ id: `t${start + i}` }),
    );
    return {
      data: {
        items,
        pagination: {
          total_count: api.total,
          max_page: Math.max(1, Math.ceil(api.total / query.limit)),
        },
      },
    };
  },
}));

const { listTransactionPages, PAGE_SIZE } = await import("./transaction-pages");

describe("listTransactionPages", () => {
  beforeEach(() => {
    api.pages = [];
  });

  it("pages through a month busier than one page holds, keeping every row in order", async () => {
    api.total = 250;

    const result = await listTransactionPages({ search: undefined });

    expect(result.items.map((t) => t.id)).toEqual(
      Array.from({ length: 250 }, (_, i) => `t${i}`),
    );
    expect(result.pagination.total_count).toBe(250);
    expect(api.pages.map((p) => [p.page, p.limit])).toEqual([
      [1, PAGE_SIZE],
      [2, PAGE_SIZE],
      [3, PAGE_SIZE],
    ]);
  });

  it("asks once for a quiet month", async () => {
    api.total = 0;

    const result = await listTransactionPages({});

    expect(result.items).toEqual([]);
    expect(api.pages).toHaveLength(1);
  });

  it("stops at the most asked for, but still says how many match", async () => {
    api.total = 1234;

    const result = await listTransactionPages(
      { search: "kaffe" },
      { max: 250 },
    );

    expect(result.items).toHaveLength(250);
    expect(result.items.at(-1)?.id).toBe("t249");
    expect(result.pagination.total_count).toBe(1234);
    expect(api.pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(api.pages.every((p) => p.search === "kaffe")).toBe(true);
  });
});
