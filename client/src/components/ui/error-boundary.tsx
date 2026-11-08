import React, { Component, ErrorInfo, ReactNode } from "react";
import { ErrorState } from "@/components/ui/error-state";

interface Props {
  children?: ReactNode;
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

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    incidentId: "",
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, incidentId: mintIncidentId() };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // The ID below is what the user quotes to support; it also tags the
    // console line so a developer can match report to devtools instantly.
    console.error(
      `[incident ${this.state.incidentId}] Uncaught error:`,
      error,
      errorInfo,
    );

    // Auto-reload for ChunkLoadError (user is on an old deployment version)
    if (
      error.name === "ChunkLoadError" ||
      error.message.includes("Failed to fetch dynamically imported module")
    ) {
      // Force a hard reload from server
      window.location.reload();
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background">
          <ErrorState
            title="This page ran into a problem"
            description="We couldn’t display this page. Return to your projects and try again."
            detail={
              this.state.incidentId
                ? `Reference: ${this.state.incidentId}`
                : undefined
            }
            home
          />
        </div>
      );
    }

    return this.props.children;
  }
}
