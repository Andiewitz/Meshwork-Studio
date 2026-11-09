import { Helmet } from "react-helmet-async";
import { Squares2X2Icon } from "@heroicons/react/24/outline";
import { Link } from "wouter";

export default function Templates() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-12">
      <Helmet>
        <title>Templates</title>
      </Helmet>
      <div className="w-full max-w-md text-center">
        <div className="dashboard-tint dashboard-secondary mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border dashboard-border">
          <Squares2X2Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="dashboard-ink mt-6 text-2xl font-semibold tracking-tight">
          Templates
        </h1>
        <p className="dashboard-secondary mt-3 text-sm leading-relaxed">
          We’re building a library of architecture templates to help you start
          your next project. They’re not available yet.
        </p>
        <Link
          href="/home"
          className="dashboard-tint dashboard-ink dashboard-hover-tint mt-6 inline-flex rounded-xl border dashboard-border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          Back to projects
        </Link>
      </div>
    </div>
  );
}
