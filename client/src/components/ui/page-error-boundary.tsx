import React, { Component, ErrorInfo, ReactNode } from "react";
import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

interface Props {
  children?: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PageErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[PageErrorBoundary] Error caught:", error, errorInfo);

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
        <div className="flex h-[60vh] w-full flex-col items-center justify-center p-6 text-center">
          <div className="flex max-w-md flex-col items-center space-y-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-8 backdrop-blur-xl">
            <div className="rounded-full bg-destructive/10 p-3">
              <ExclamationTriangleIcon className="h-8 w-8 text-destructive" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold tracking-tight text-white">
                {this.props.fallbackTitle || "Failed to load page content"}
              </h3>
              <p className="text-xs text-white/40">
                An unexpected error occurred while displaying this section.
              </p>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <div className="w-full rounded-lg bg-black/50 p-3 text-left border border-white/5">
                <p className="font-mono text-[11px] text-red-400 break-all">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <Button
              onClick={this.handleReset}
              variant="outline"
              size="sm"
              className="mt-2 gap-2 text-xs border-white/10 hover:bg-white/10"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
