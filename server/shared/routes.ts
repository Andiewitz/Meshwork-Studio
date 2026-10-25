import { z } from "zod";
import { insertWorkspaceSchema } from "./schema";
import { canvasSyncSchema } from "./canvas";
import type { Collection, Workspace } from "./schema";

// Canonical error envelope (see server/lib/errorEnvelope.ts). Fields beyond
// `message` are additive so older clients that only read `message` still work.
const errorEnvelope = z.object({
  message: z.string(),
  code: z.string().optional(),
  requestId: z.string().optional(),
  issues: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});

export const errorSchemas = {
  validation: errorEnvelope.extend({
    field: z.string().optional(),
  }),
  notFound: errorEnvelope,
  internal: errorEnvelope,
  unauthorized: errorEnvelope,
  forbidden: errorEnvelope,
};

export const api = {
  workspaces: {
    list: {
      method: "GET" as const,
      path: "/api/v1/workspaces" as const,
      responses: {
        200: z.array(z.custom<Workspace>()),
        401: errorSchemas.unauthorized,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/v1/workspaces" as const,
      input: insertWorkspaceSchema,
      responses: {
        201: z.custom<Workspace>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/v1/workspaces/:id" as const,
      responses: {
        200: z.custom<Workspace>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
        403: errorSchemas.forbidden,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/v1/workspaces/:id" as const,
      input: insertWorkspaceSchema.partial(),
      responses: {
        200: z.custom<Workspace>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
        403: errorSchemas.forbidden,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/v1/workspaces/:id" as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
        403: errorSchemas.forbidden,
      },
    },
    duplicate: {
      method: "POST" as const,
      path: "/api/v1/workspaces/:id/duplicate" as const,
      input: z.object({ title: z.string().optional() }),
      responses: {
        201: z.custom<Workspace>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
        403: errorSchemas.forbidden,
      },
    },
    retryCanvasCopy: {
      method: "POST" as const,
      path: "/api/v1/workspaces/:id/retry-canvas-copy" as const,
      input: z.object({}),
      responses: {
        200: z.custom<Workspace>(),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
        409: errorSchemas.validation,
        403: errorSchemas.forbidden,
      },
    },
    getCanvas: {
      method: "GET" as const,
      path: "/api/v1/workspaces/:id/canvas" as const,
      responses: {
        200: z.object({
          nodes: z.array(z.any()),
          edges: z.array(z.any()),
          revision: z.number().int().nonnegative(),
        }),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
        403: errorSchemas.forbidden,
        409: errorSchemas.validation,
        503: errorSchemas.internal,
      },
    },
    syncCanvas: {
      method: "POST" as const,
      path: "/api/v1/workspaces/:id/canvas" as const,
      input: canvasSyncSchema,
      responses: {
        200: z.object({ success: z.boolean(), revision: z.number().int() }),
        409: errorSchemas.validation,
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
        400: errorSchemas.validation,
        403: errorSchemas.forbidden,
        503: errorSchemas.internal,
      },
    },
  },
};

export function buildUrl(
  path: string,
  params?: Record<string, string | number>,
): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
