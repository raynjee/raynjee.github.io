// App-level error boundary.
//
// The reading desk is a long-lived single-page experience: when any unhandled
// exception blew up a route (corrupt IndexedDB row, bad heuristic, a regex
// null-deref inside Epub parsing, etc.), the entire app would unmount into a
// blank screen and lose the session. This boundary catches anything below it in
// the React tree and renders a minimal, self-contained recovery card.
//
// Deliberately does NOT import useSettings / useTheme / sonner / framer-motion
// — the providers those hooks consume are part of the tree we're protecting,
// so they may have failed. The fallback relies purely on CSS variables and
// native APIs so it's guaranteed to render.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console is the only safe sink — anything fancier (Sentry, telemetry)
    // would defeat the privacy-first value of this project.
    console.error("App error boundary caught:", error, info.componentStack);
  }

  private handleReload = () => {
    // Preserve library-allocation dialogs: ask the user before destroying
    // in-flight translation state in the window globals.
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem("raynets.app.lastError"); } catch {}
      try {
        window.localStorage.setItem(
          "raynets.app.lastError",
          JSON.stringify({
            message: this.state.error?.message ?? "Unknown error",
            at: Date.now(),
          }),
        );
      } catch {}
    }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  private handleDismiss = () => {
    // If the user wants to keep poking without reloading, unmount the
    // boundary and re-render children. The original error MAY resurface;
    // the boundary just gives them the choice.
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Inline styles only — do not depend on the Tailwind theme classes
    // because the providers that emit them may have thrown.
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.25rem",
          background: "var(--background, #fff)",
          color: "var(--foreground, #111)",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          role="alert"
          aria-live="polite"
          style={{
            maxWidth: "32rem",
            width: "100%",
            border: "1px solid var(--border, rgba(0,0,0,10%))",
            padding: "1.75rem 1.5rem",
            background: "var(--card, #fff)",
          }}
        >
          <div
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              opacity: 0.6,
              marginBottom: "0.75rem",
            }}
          >
            Something went wrong
          </div>
          <h1
            style={{
              fontSize: "1.4rem",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              lineHeight: 1.25,
              margin: "0 0 0.6rem 0",
            }}
          >
            The reading desk hit a snag.
          </h1>
          <p
            style={{
              fontSize: "0.95rem",
              lineHeight: 1.55,
              opacity: 0.75,
              margin: "0 0 1.25rem 0",
            }}
          >
            Your library and translations are intact — this just stopped the
            current view. Reload to start fresh, or dismiss to keep going in
            degraded mode.
          </p>

          {error.message && (
            <details
              style={{
                marginBottom: "1.25rem",
                fontSize: "0.78rem",
                opacity: 0.65,
                lineHeight: 1.5,
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  listStyle: "none",
                  marginBottom: "0.4rem",
                  userSelect: "none",
                }}
              >
                Error details
              </summary>
              <pre
                style={{
                  margin: 0,
                  padding: "0.75rem 0.85rem",
                  background: "var(--muted, rgba(0,0,0,3%))",
                  border: "1px solid var(--border, rgba(0,0,0,10%))",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily:
                    "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: "0.72rem",
                  maxHeight: "8rem",
                  overflow: "auto",
                }}
              >
                {error.message}
              </pre>
            </details>
          )}

          <div
            style={{
              display: "flex",
              gap: "0.6rem",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                height: "2.4rem",
                padding: "0 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                background: "var(--foreground, #111)",
                color: "var(--background, #fff)",
                border: "1px solid var(--foreground, #111)",
                cursor: "pointer",
              }}
            >
              Reload app
            </button>
            <button
              type="button"
              onClick={this.handleDismiss}
              style={{
                height: "2.4rem",
                padding: "0 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                background: "transparent",
                color: "var(--foreground, #111)",
                border: "1px solid var(--border, rgba(0,0,0,15%))",
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
