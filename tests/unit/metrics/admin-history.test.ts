import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

// Execute the shipped admin-page functions with DOM/chart adapters. This checks
// actual rendering logic, not a second implementation of its null formatting.
function dashboard(history: unknown[], summary: unknown, status = 200) {
  const html = readFileSync("server/public/admin/index.html", "utf8");
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!script) throw new Error("Admin script not found");
  const nodes = new Map<string, { innerHTML: string; textContent: string }>();
  const getNode = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: "", textContent: "" });
    return nodes.get(id)!;
  };
  const context = createContext({
    document: { getElementById: getNode },
    console: { error: vi.fn() },
    fetch: vi.fn(async (url: string) =>
      Response.json(url.includes("history?") ? history : summary, { status }),
    ),
  });
  runInContext(
    script.replace("init();poll();setInterval(poll,POLL);", ""),
    context,
  );
  runInContext(
    `for (const name of ['req','userGrowth','lat','ws','ai']) charts[name] = { data: { datasets: Array.from({length: 3}, () => ({})) }, update() {} };`,
    context,
  );
  return { context, getNode };
}

describe("admin history display", () => {
  it("shows missing counts as unavailable while preserving actual zero", async () => {
    const { context, getNode } = dashboard(
      [
        {
          capturedAt: "2026-10-26T00:00:00Z",
          totalUsers: null,
          newUsersToday: null,
          activeUsers24h: null,
          loginsToday: null,
          totalWorkspaces: 0,
          totalTeams: 7,
        },
      ],
      { totalUsers: null, activeUsers24h: null },
    );
    await runInContext("loadHistory()", context);
    expect(getNode("summary").innerHTML).toContain(
      "Unavailable</strong> registered users",
    );
    expect(getNode("userCards").innerHTML).toContain(
      'Workspaces</div><div class="stat-value">0</div>',
    );
    expect(getNode("userCards").innerHTML).toContain(
      'Registered Users</div><div class="stat-value">Unavailable</div>',
    );
    expect(
      runInContext("charts.userGrowth.data.datasets[0].data[0]", context),
    ).toBeNull();
  });

  it("shows an unavailable/stale notice on a failed history response", async () => {
    const { context, getNode } = dashboard([], {}, 503);
    await runInContext("loadHistory()", context);
    expect(getNode("summary").textContent).toContain(
      "Previously loaded charts may be stale",
    );
    expect(getNode("userCards").textContent).toContain("Counts unavailable");
  });

  it("does not invent zero users before the first snapshot", async () => {
    const { context, getNode } = dashboard([], null);
    await runInContext("loadHistory()", context);
    expect(getNode("summary").innerHTML).toContain(
      "Unavailable</strong> registered users",
    );
  });
});
