import {
  listActivitySourcesOptions,
  listBankAccountsOptions,
  listHealthkitSleepOptions,
} from "@bessel/client";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useWindowState } from "@/components/canvas/window-manager";
import {
  isOptionalPage,
  type OptionalPage,
  type PageKey,
} from "@/components/pages";
import { useSettings } from "@/hooks/use-settings";
import { client } from "@/lib/client";

const INVESTMENT_SUBTYPES = new Set(["isk", "af", "kf", "brokerage"]);

/** Same query as the Add account dialog's, so the two share one cache entry. */
const BANK_ACCOUNTS_QUERY = {
  limit: 100,
  page: 1,
  sorting: ["name" as const],
};

/**
 * Whether each optional page has anything to show: undefined while unknown.
 * A query that fails counts as nothing, so the page stays out of the way.
 */
function useOptionalPageData(
  skip: (page: OptionalPage) => boolean,
): Record<OptionalPage, boolean | undefined> {
  const { settings } = useSettings();
  const { windowsByWorkspace } = useWindowState();
  const accounts = useQuery({
    ...listBankAccountsOptions({ client, query: BANK_ACCOUNTS_QUERY }),
    enabled: !skip("investments"),
  });
  const sleep = useQuery({
    ...listHealthkitSleepOptions({ client, query: { limit: 1 } }),
    enabled: !skip("sleep"),
  });
  const activity = useQuery({
    ...listActivitySourcesOptions({ client }),
    enabled: !skip("activity"),
  });

  const known = <T>(
    query: { data: T | undefined; isError: boolean },
    has: (data: T) => boolean,
  ) => (query.data ? has(query.data) : query.isError ? false : undefined);

  return {
    hyperliquid: !!settings.hyperliquidAddress,
    investments: known(accounts, (d) =>
      d.items.some((a) => INVESTMENT_SUBTYPES.has(a.subtype)),
    ),
    sleep: known(sleep, (d) => d.items.length > 0),
    activity: known(activity, (d) => d.sources.length > 0),
    canvas: [...windowsByWorkspace.values()].some((w) => w.length > 0),
  };
}

/**
 * Which sidebar pages to show. An optional page shows when someone turned it
 * on, when its data exists, or when the settings predate optional pages;
 * turning it off hides it whatever its data.
 */
export function usePageVisibility() {
  const { settings } = useSettings();
  const { pageChoices, showOptionalPages } = settings;
  const decided = useCallback(
    (page: OptionalPage) =>
      pageChoices[page] !== undefined || showOptionalPages,
    [pageChoices, showOptionalPages],
  );
  const data = useOptionalPageData(decided);
  const { hyperliquid, investments, sleep, activity, canvas } = data;

  return useMemo(() => {
    const hasData = { hyperliquid, investments, sleep, activity, canvas };
    const isVisible = (page: PageKey) =>
      !isOptionalPage(page) ||
      (pageChoices[page] ?? (showOptionalPages || !!hasData[page]));
    /** Whether isVisible(page) is final rather than waiting on data. */
    const isSettled = (page: PageKey) =>
      !isOptionalPage(page) || decided(page) || hasData[page] !== undefined;
    return { isVisible, isSettled };
  }, [
    pageChoices,
    showOptionalPages,
    decided,
    hyperliquid,
    investments,
    sleep,
    activity,
    canvas,
  ]);
}

/**
 * Moves off a page that shouldn't show: the one restored from last time once
 * its visibility is known, or the open page when someone turns it off. Pages
 * opened on purpose (e.g. from search) stay, even when hidden from the sidebar.
 */
export function useHiddenPageFallback(
  activePage: PageKey,
  goTo: (page: PageKey) => void,
) {
  const { settings } = useSettings();
  const { isVisible, isSettled } = usePageVisibility();
  const restored = useRef<PageKey | null>(activePage);
  const choice = isOptionalPage(activePage)
    ? settings.pageChoices[activePage]
    : undefined;
  const lastChoice = useRef({ page: activePage, choice });

  useEffect(() => {
    if (restored.current !== activePage) restored.current = null;
    if (!restored.current || !isSettled(activePage)) return;
    restored.current = null;
    if (!isVisible(activePage)) goTo("today");
  }, [activePage, isVisible, isSettled, goTo]);

  useEffect(() => {
    const last = lastChoice.current;
    lastChoice.current = { page: activePage, choice };
    if (last.page === activePage && last.choice !== false && choice === false)
      goTo("today");
  }, [activePage, choice, goTo]);
}
