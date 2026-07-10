import { AlertTriangle } from "lucide-react";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// A render error inside one widget (or one panel of a widget) shouldn't take
// down the whole dashboard — the app only has a single, full-page
// ErrorBoundary at the route root. Wrap a widget's riskier subtrees in this
// so a bug stays contained to the space it broke in.
export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Widget render error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <AlertTriangle className="size-5 text-white/25" />
          <p className="text-xs text-white/50">Couldn't render this view</p>
        </div>
      );
    }
    return this.props.children;
  }
}
