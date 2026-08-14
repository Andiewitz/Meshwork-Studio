import { z } from "zod";
import {
  insertWorkspaceSchema,
  workspaces,
  collections,
  insertCollectionSchema,
} from "./schema";

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
  collections: {
    list: {
      method: "GET" as const,
      path: "/api/v1/collections" as const,
      responses: {
        200: z.array(z.custom<typeof collections.$inferSelect>()),
        401: errorSchemas.unauthorized,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/v1/collections" as const,
      input: insertCollectionSchema,
      responses: {
        201: z.custom<typeof collections.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
  },
  workspaces: {
    list: {
      method: "GET" as const,
      path: "/api/v1/workspaces" as const,
      responses: {
        200: z.array(z.custom<typeof workspaces.$inferSelect>()),
        401: errorSchemas.unauthorized,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/v1/workspaces" as const,
      input: insertWorkspaceSchema,
      responses: {
        201: z.custom<typeof workspaces.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/v1/workspaces/:id" as const,
      responses: {
        200: z.custom<typeof workspaces.$inferSelect>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/v1/workspaces/:id" as const,
      input: insertWorkspaceSchema.partial(),
      responses: {
        200: z.custom<typeof workspaces.$inferSelect>(),
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
        201: z.custom<typeof workspaces.$inferSelect>(),
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
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
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
