import { z } from "zod";
import { insertWorkspaceSchema } from "./schema";
import type { Collection, Workspace } from "./schema";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
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
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/v1/workspaces/:id" as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
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
      },
    },
    syncCanvas: {
      method: "POST" as const,
      path: "/api/v1/workspaces/:id/canvas" as const,
      input: z.object({
        nodes: z.array(z.any()),
        edges: z.array(z.any()),
        baseRevision: z.number().int().nonnegative(),
      }),
      responses: {
        200: z.object({ success: z.boolean(), revision: z.number().int() }),
        409: errorSchemas.validation,
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
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
