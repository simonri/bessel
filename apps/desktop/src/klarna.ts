import { BrowserWindow, session, shell } from "electron";
import { bearerToken, isBankIdLink } from "./klarna-core.js";

// Kept between sign-ins, so Klarna can remember the login and skip BankID next time.
export const KLARNA_PARTITION = "persist:klarna";
const KLARNA_APP = "https://app.klarna.com/se/";
// Klarna's purchase and payment API; only a signed-in page calls it, so its token is the user's.
const API_URLS = ["https://app.klarna.com/*/api/post_purchase_bff/*"];
const SIGN_IN_TIMEOUT_MS = 10 * 60_000;

export interface KlarnaCredentials {
  authorization: string;
  cookie: string;
}

let pending: Promise<KlarnaCredentials | null> | null = null;

async function cookieHeader(ses: Electron.Session): Promise<string> {
  const cookies = await ses.cookies.get({ url: "https://app.klarna.com" });
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * Opens Klarna's own sign-in and resolves with the token its page uses once
 * signed in, or null if the window is closed first. Klarna's tokens last
 * minutes, so the caller imports with them straight away.
 */
export function signInToKlarna(
  parent: BrowserWindow | null,
  userAgent: string,
): Promise<KlarnaCredentials | null> {
  if (pending) return pending;
  pending = new Promise<KlarnaCredentials | null>((resolve) => {
    const ses = session.fromPartition(KLARNA_PARTITION);
    ses.setUserAgent(userAgent);
    const win = new BrowserWindow({
      width: 480,
      height: 800,
      title: "Sign in to Klarna",
      ...(parent ? { parent } : {}),
      autoHideMenuBar: true,
      webPreferences: {
        partition: KLARNA_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    let settled = false;
    const finish = (credentials: KlarnaCredentials | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ses.webRequest.onBeforeSendHeaders(null);
      if (!win.isDestroyed()) win.close();
      resolve(credentials);
    };
    const timer = setTimeout(() => finish(null), SIGN_IN_TIMEOUT_MS);

    ses.webRequest.onBeforeSendHeaders(
      { urls: API_URLS },
      (details, callback) => {
        callback({});
        const authorization = bearerToken(details.requestHeaders);
        if (!authorization) return;
        void cookieHeader(ses).then((cookie) =>
          finish({ authorization, cookie }),
        );
      },
    );
    // BankID on this computer opens through its own app; anything else stays out.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (isBankIdLink(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
      if (isBankIdLink(url)) {
        event.preventDefault();
        void shell.openExternal(url);
      }
    });
    win.on("closed", () => finish(null));
    void win.loadURL(KLARNA_APP);
  }).finally(() => {
    pending = null;
  });
  return pending;
}
