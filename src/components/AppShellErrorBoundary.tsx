"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import AppShellOfflineGate from "@/components/AppShellOfflineGate";

type Props = { children: ReactNode };

type State = { failed: boolean };

/** Keep shell UI failures from taking down the whole root layout. */
export default class AppShellErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[app-shell]", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <AppShellOfflineGate
          reason="server"
          checking={false}
          onRetry={() => {
            this.setState({ failed: false });
            window.location.reload();
          }}
        />
      );
    }
    return this.props.children;
  }
}
