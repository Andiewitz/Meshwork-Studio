import React from "react";
import type { DiagramStarter } from "../utils/diagramStarters";

const choices: { id: DiagramStarter; label: string; description: string }[] = [
  {
    id: "architecture",
    label: "Architecture",
    description: "User, service, and database",
  },
  {
    id: "workflow",
    label: "Workflow",
    description: "Request, review, decision, and outcome",
  },
  {
    id: "data",
    label: "Data pipeline",
    description: "Source, transform, dataset, and destination",
  },
];

export function DiagramStarterChooser({
  onChoose,
  onBlank,
}: {
  onChoose: (kind: DiagramStarter) => void;
  onBlank: () => void;
}) {
  return (
    <section
      aria-labelledby="diagram-starter-title"
      className="absolute top-5 left-1/2 z-30 w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border ws-border ws-option p-4 shadow-lg select-text"
    >
      <h2 id="diagram-starter-title" className="text-base font-semibold ws-ink">
        Start your diagram
      </h2>
      <p className="mt-1 text-sm ws-muted">
        Choose an editable example or start with a blank canvas.
      </p>
      <div className="mt-3 space-y-1">
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            onClick={() => onChoose(choice.id)}
            className="w-full rounded-md border ws-border px-3 py-2 text-left ws-hover-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <span className="block text-sm font-medium ws-ink">
              {choice.label}
            </span>
            <span className="block text-xs ws-muted mt-0.5">
              {choice.description}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onBlank}
        className="mt-3 rounded px-2 py-1.5 text-sm ws-muted ws-hover-ink ws-hover-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        Start blank
      </button>
    </section>
  );
}
