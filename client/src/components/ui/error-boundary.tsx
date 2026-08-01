import React, { Component, ErrorInfo, ReactNode } from "react";
import {
  ExclamationCircleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);

    // Auto-reload for ChunkLoadError (user is on an old deployment version)
    if (
      error.name === "ChunkLoadError" ||
      error.message.includes("Failed to fetch dynamically imported module")
    ) {
      // Force a hard reload from server
      window.location.reload();
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-background text-foreground">
          <div className="flex max-w-md flex-col items-center space-y-6 text-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <ExclamationCircleIcon className="h-10 w-10 text-destructive" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Something went wrong
              </h2>
              <p className="text-sm text-muted-foreground">
                We encountered an unexpected error while rendering this page.
              </p>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="w-full rounded-md bg-muted p-4 text-left">
                <p className="font-mono text-xs text-muted-foreground break-all">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <Button onClick={this.handleReset} className="mt-4 gap-2">
              <ArrowPathIcon className="h-4 w-4" />
              Return to Home
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
