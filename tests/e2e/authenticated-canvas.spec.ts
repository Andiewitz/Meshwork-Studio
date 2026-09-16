import { expect, test, type APIRequestContext } from "@playwright/test";

interface Workspace {
  id: string;
  title: string;
}

async function csrfToken(request: APIRequestContext) {
  const response = await request.get("/api/v1/auth/csrf-token");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { csrfToken?: string };
  expect(body.csrfToken).toBeTruthy();
  return body.csrfToken!;
}

test("@authenticated registers, saves a nested canvas, and reloads it", async ({
  page,
}) => {
  const request = page.request;
  const token = await csrfToken(request);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await request.post("/api/v1/auth/register", {
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5000",
      "X-CSRF-Token": token,
    },
    data: {
      email: `e2e-${suffix}@example.test`,
      password: `E2e-${suffix}-not-a-real-password`,
      firstName: "Canvas",
      lastName: "Tester",
    },
  });
  expect(registration.status(), await registration.text()).toBe(200);

  // Workspace titles are deliberately capped at 16 characters by the API.
  const title = `E2E-${Date.now().toString(36)}`;
  const workspaceResponse = await request.post("/api/v1/workspaces", {
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5000",
      "X-CSRF-Token": token,
    },
    data: { title, type: "system", icon: "box" },
  });
  expect(workspaceResponse.status(), await workspaceResponse.text()).toBe(201);
  const workspace = (await workspaceResponse.json()) as Workspace;

  const nodes = [
    {
      id: "vpc",
      type: "vpc",
      position: { x: 40, y: 40 },
      width: 640,
      height: 420,
      data: { label: "Production VPC" },
    },
    {
      id: "zone-a",
      type: "availability-zone",
      parentId: "vpc",
      extent: "parent",
      position: { x: 24, y: 56 },
      width: 560,
      height: 300,
      data: { label: "Zone A" },
    },
    {
      id: "api",
      type: "service",
      parentId: "zone-a",
      extent: "parent",
      position: { x: 80, y: 96 },
      width: 180,
      height: 80,
      data: { label: "API" },
    },
  ];
  const edges = [{ id: "api-to-vpc", source: "api", target: "vpc" }];
  const save = await request.post(`/api/v1/workspaces/${workspace.id}/canvas`, {
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5000",
      "X-CSRF-Token": token,
    },
    data: { nodes, edges, baseRevision: 0 },
  });
  expect(save.status(), await save.text()).toBe(200);
  expect((await save.json()) as { revision: number }).toMatchObject({
    revision: 1,
  });

  const reload = await request.get(`/api/v1/workspaces/${workspace.id}/canvas`);
  expect(reload.status(), await reload.text()).toBe(200);
  const persisted = (await reload.json()) as {
    nodes: {
      id: string;
      parentId?: string;
      width?: number;
      height?: number;
    }[];
    revision: number;
  };
  expect(persisted.revision).toBe(1);
  expect(persisted.nodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "vpc", width: 640, height: 420 }),
      expect.objectContaining({ id: "zone-a", parentId: "vpc" }),
      expect.objectContaining({ id: "api", parentId: "zone-a" }),
    ]),
  );

  await page.goto(`/workspace/${workspace.id}`);
  await expect(
    page.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
});
