import React, { Component, ErrorInfo, ReactNode } from "react";
import { ErrorState } from "@/components/ui/error-state";

interface Props {
  children?: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** Client-minted incident ID (render crashes never reach the server). */
  incidentId: string;
}

function mintIncidentId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `req-${hex}`;
}

export class PageErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    incidentId: "",
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, incidentId: mintIncidentId() };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[PageErrorBoundary] [incident ${this.state.incidentId}] Error caught:`,
      error,
      errorInfo,
    );

    // Auto-reload if dynamic module import failed due to app deployment update
    if (
      error.name === "ChunkLoadError" ||
      error.message?.includes("Failed to fetch dynamically imported module")
    ) {
      window.location.reload();
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          title={this.props.fallbackTitle || "This page couldn’t load"}
          description="Something went wrong while displaying this section. Try again."
          detail={
            this.state.incidentId
              ? `Reference: ${this.state.incidentId}`
              : undefined
          }
          onRetry={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}
