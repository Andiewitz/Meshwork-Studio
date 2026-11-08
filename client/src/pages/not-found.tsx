import { ErrorState } from "@/components/ui/error-state";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center bg-background">
      <ErrorState
        title="Page not found"
        description="This page may have moved or the link may be incorrect."
        home
      />
    </div>
  );
}
