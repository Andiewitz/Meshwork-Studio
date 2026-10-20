# Issues and post-mortems

One folder per issue: the date it was opened (`YYYY-MM-DD`), then a short issue
slug. Undated legacy records use `L1`, `L2`, `L3`, … in the order they were
archived.

```
issues/
└── 2026-10-20/
    └── canvas-performance/
        ├── issue.md        # what is wrong, repro, evidence
        ├── solution.md     # proposed/implemented fix
        └── postmortem.md   # timeline, root causes, lessons, action items
```

Legacy records may contain only a `postmortem.md` (or only an `issue.md`) when
that is all that survived; do not invent missing sections. Link the GitHub
issue from `issue.md` when one exists. Archived audits and plans that are not
tied to a specific issue stay in [`docs/archive/`](../docs/archive/).

## Index

| Date       | Issue                      | Notes                                |
| ---------- | -------------------------- | ------------------------------------ |
| 2026-10-20 | Canvas performance         | GitHub #48, open                     |
| 2026-08-21 | Stale CSRF token → 403s    | Fixed and deployed                   |
| 2026-02-25 | UI and infrastructure bugs | Legacy post-mortem (Feb 25–26, 2026) |
