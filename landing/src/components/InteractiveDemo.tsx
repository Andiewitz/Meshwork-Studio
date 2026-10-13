import { useMemo, useState } from "react";

// Deployments island — the only component that ships JS (client:visible).
// Table per DESIGN.md §8.2: 28h header, 24h rows, numbers right-aligned,
// status = glyph + text label, never color alone. No green anywhere.

type Status = "Running" | "Pending" | "Degraded" | "Failed" | "Stopped";

interface Deployment {
  name: string;
  status: Status;
  replicas: string;
  age: string;
}

const ROWS: Deployment[] = [
  { name: "api-gateway", status: "Running", replicas: "12/12", age: "2h ago" },
  {
    name: "worker-billing",
    status: "Pending",
    replicas: "2/6",
    age: "14m ago",
  },
  { name: "cache-eu-1", status: "Degraded", replicas: "3/4", age: "1h ago" },
  { name: "auth", status: "Failed", replicas: "0/3", age: "26m ago" },
  {
    name: "search-indexer",
    status: "Stopped",
    replicas: "0/0",
    age: "2026-09-28 09:14",
  },
];

function Glyph({ status }: { status: Status }) {
  const cls = "mr-2 inline-block h-2 w-2 align-middle";
  switch (status) {
    case "Running":
      return (
        <span aria-hidden="true" className={`${cls} rounded-full bg-muted`} />
      );
    case "Pending":
      return (
        <svg
          aria-hidden="true"
          width="8"
          height="8"
          viewBox="0 0 8 8"
          className="mr-2 inline-block align-middle"
        >
          <circle
            cx="4"
            cy="4"
            r="3.2"
            fill="none"
            stroke="var(--warning)"
            strokeWidth="1.2"
          />
          <path d="M4 0.8 A3.2 3.2 0 0 0 4 7.2 Z" fill="var(--warning)" />
        </svg>
      );
    case "Degraded":
      return (
        <svg
          aria-hidden="true"
          width="8"
          height="8"
          viewBox="0 0 8 8"
          className="mr-2 inline-block align-middle"
        >
          <path
            d="M4 0.5 7.5 7.5H0.5Z"
            fill="none"
            stroke="var(--warning)"
            strokeWidth="1.2"
          />
        </svg>
      );
    case "Failed":
      return (
        <svg
          aria-hidden="true"
          width="8"
          height="8"
          viewBox="0 0 8 8"
          className="mr-2 inline-block align-middle"
        >
          <circle
            cx="4"
            cy="4"
            r="3.2"
            fill="none"
            stroke="var(--error)"
            strokeWidth="1.2"
          />
          <path
            d="M2.6 2.6l2.8 2.8M5.4 2.6L2.6 5.4"
            stroke="var(--error)"
            strokeWidth="1.2"
          />
        </svg>
      );
    case "Stopped":
      return (
        <span
          aria-hidden="true"
          className={`${cls} rounded-full border border-disabled`}
        />
      );
  }
}

export default function InteractiveDemo() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>("api-gateway");
  const failed = ROWS.filter((r) => r.status === "Failed").length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROWS;
    return ROWS.filter(
      (r) => r.name.includes(q) || r.status.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="overflow-hidden rounded-lg bg-tool">
      <div className="flex h-10 items-center gap-2 px-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="k8s-prod-eu-1"
          aria-label="Filter deployments by name or status"
          spellCheck={false}
          className="h-7 w-64 rounded border border-border-strong bg-island px-2 text-[13px] text-fg placeholder:text-disabled focus:border-accent focus:outline-none"
        />
        <span className="text-[12px] text-disabled">
          {rows.length} of {ROWS.length} shown
        </span>
      </div>
      <table className="w-full border-t border-border text-[13px]">
        <thead>
          <tr className="h-7 text-left text-[12px] font-semibold text-muted">
            <th className="px-2 font-semibold">Name</th>
            <th className="px-2 font-semibold">Status</th>
            <th className="px-2 text-right font-semibold">Replicas</th>
            <th className="px-2 text-right font-semibold">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const active = selected === r.name;
            return (
              <tr
                key={r.name}
                tabIndex={0}
                aria-selected={active}
                onClick={() => setSelected(r.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(r.name);
                  }
                }}
                className={`h-6 cursor-default border-t border-border outline-none transition-colors ${
                  active ? "bg-selection text-fg" : "text-fg hover:bg-hover"
                } focus-visible:outline-2 focus-visible:outline-accent-text`}
              >
                <td className="px-2 font-mono">{r.name}</td>
                <td className="px-2">
                  <Glyph status={r.status} />
                  {r.status}
                </td>
                <td className="tabular px-2 text-right">{r.replicas}</td>
                <td className="tabular px-2 text-right text-muted">{r.age}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr className="h-6 border-t border-border">
              <td colSpan={4} className="px-2 text-muted">
                No deployments match.{" "}
                <span className="text-accent-text">Clear the filter</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex h-7 items-center justify-between border-t border-border px-2 text-[12px] text-disabled">
        <span>
          {ROWS.length} deployments · {failed} failed
        </span>
        {selected && <span className="font-mono">{selected}</span>}
      </div>
    </div>
  );
}
