import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { failed: boolean; }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Intentionally avoid logging raw local data from calendar or workspace views.
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="app-recovery" role="alert">
      <h1>Attention Hub needs to reopen this view</h1>
      <p>Your locally saved data was not removed.</p>
      <button onClick={() => window.location.reload()} type="button">Reload view</button>
    </main>;
  }
}
