import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary that catches unhandled React errors and displays
 * a fallback UI instead of a blank screen. Particularly important for a
 * desktop companion app that runs continuously.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'white', background: '#1a1a1a', height: '100vh' }}>
          <h2>Something went wrong</h2>
          <pre style={{ fontSize: 12, opacity: 0.7 }}>{this.state.error?.message}</pre>
          <button onClick={() => window.location.reload()}>Restart</button>
        </div>
      );
    }
    return this.props.children;
  }
}
