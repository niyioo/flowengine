import { Component } from "react";

/**
 * Contains render errors (e.g. a chart choking on unexpected data) to the
 * region that failed, instead of unmounting the whole application.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI error boundary caught:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Clear the error when navigating to another page.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="card" role="alert">
        <div className="card-body" style={{ display: "grid", gap: "var(--space-3)" }}>
          <strong>This section failed to display.</strong>
          <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
            The rest of the application is unaffected. Reload the page to try again.
          </span>
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
