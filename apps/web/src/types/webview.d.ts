// @types/react already declares the <webview> JSX intrinsic and its attributes
// (WebViewHTMLAttributes) — but its element type, HTMLWebViewElement, is an
// empty stub with none of Electron's imperative methods, so those are added here.

export interface WebviewTag extends HTMLElement {
  src: string;
  loadURL(url: string): Promise<void>;
  getURL(): string;
  getTitle(): string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  isLoading(): boolean;
}

export interface DidNavigateEvent extends Event {
  url: string;
}

export interface PageTitleUpdatedEvent extends Event {
  title: string;
}

export interface DidFailLoadEvent extends Event {
  errorCode: number;
  errorDescription: string;
  isMainFrame: boolean;
}
