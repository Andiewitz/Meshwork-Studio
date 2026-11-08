import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Link } from "wouter";

export function ErrorState({
  title,
  description,
  detail,
  onRetry,
  home = false,
}: {
  title: string;
  description: string;
  detail?: string;
  onRetry?: () => void;
  home?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-[min(60vh,32rem)] w-full items-center justify-center p-5 text-foreground"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <ExclamationTriangleIcon className="h-5 w-5" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {detail && (
          <p className="mt-3 break-words text-xs leading-relaxed text-muted-foreground">
            {detail}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Try again
            </button>
          )}
          {home && (
            <Link
              href="/home"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Back to projects
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
