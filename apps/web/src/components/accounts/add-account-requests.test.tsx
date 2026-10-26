// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestAddAccount, useAddAccountRequests } from "./account-actions";

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe("add-account requests", () => {
  it("takes a request made before Accounts opened, once", () => {
    requestAddAccount();
    const onRequest = vi.fn();

    renderHook(() => useAddAccountRequests(onRequest));
    renderHook(() => useAddAccountRequests(onRequest));

    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it("takes a request made while Accounts is open", () => {
    const onRequest = vi.fn();
    renderHook(() => useAddAccountRequests(onRequest));
    expect(onRequest).not.toHaveBeenCalled();

    act(() => requestAddAccount());

    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it("stops listening once Accounts closes", () => {
    const onRequest = vi.fn();
    const { unmount } = renderHook(() => useAddAccountRequests(onRequest));
    unmount();

    requestAddAccount();

    expect(onRequest).not.toHaveBeenCalled();
  });
});
