// Client↔server contract for workspace create/update payloads.
// Plain zod — deliberately NOT derived from drizzle so the client can import
// it without bundling database code. Constraints mirror the DB columns.
import { z } from "zod";

const titleRegex = /^[a-zA-Z0-9\-_\s]+$/;
const hasEmojiRegex =
  /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|[\u3297\u3299][\ufe0f]?|[\u303d\u3030\u2b55\u2b50\u2b1c\u2b1b\u23f3\u23f0\u231b\u231a\u21aa\u2199\u2198\u2197\u2196\u2195\u2194\u2139\u2122\u2049\u203c\u3030]|[\u2600-\u26FF][\ufe0f]?|[\u2700-\u27BF][\ufe0f]?)/;

const titleSchema = z.preprocess(
  (val) => {
    if (val === undefined || val === null) return "Untitled";
    if (typeof val === "string" && val.trim() === "") return "Untitled";
    return val;
  },
  z
    .string()
    .max(16, "Title must be 16 characters or less")
    .refine((val) => !hasEmojiRegex.test(val), {
      message: "Title cannot contain emojis",
    })
    .refine((val) => titleRegex.test(val), {
      message:
        "Title can only contain letters, numbers, spaces, hyphens, and underscores",
    }),
);

export const insertWorkspaceSchema = z.object({
  title: titleSchema,
  type: z.string().default("system"),
  icon: z.string().default("box"),
  description: z.string().nullish(),
  author: z.string().nullish(),
  aiContext: z.string().nullish(),
  isFavorite: z.boolean().default(false),
  collectionId: z.number().int().nullish(),
  groups: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

/** Direct workspace sharing has only read-only and edit permissions. */
export const workspaceCollaboratorPermissionSchema = z.enum(["view", "edit"]);
export type WorkspaceCollaboratorPermission = z.infer<
  typeof workspaceCollaboratorPermissionSchema
>;

export const workspaceAccessSchema = z.enum(["owner", "edit", "view", "none"]);
export type WorkspaceAccess = z.infer<typeof workspaceAccessSchema>;

/**
 * Storage-level collaborator grant. Public routes intentionally do not use
 * this contract yet: they will resolve an account email through the auth
 * service before creating a grant.
 */
export const upsertWorkspaceCollaboratorSchema = z.object({
  workspaceId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
  permission: workspaceCollaboratorPermissionSchema,
  addedBy: z.string().min(1).max(128),
});
export type UpsertWorkspaceCollaborator = z.infer<
  typeof upsertWorkspaceCollaboratorSchema
>;

export const updateWorkspaceCollaboratorPermissionSchema = z.object({
  permission: workspaceCollaboratorPermissionSchema,
});

/** Input: defaulted fields are optional. */
export type InsertWorkspace = z.input<typeof insertWorkspaceSchema>;
/** Parsed output as stored/returned. */
export type WorkspaceParsed = z.output<typeof insertWorkspaceSchema>;
export type UpdateWorkspaceRequest = Partial<
  z.input<typeof insertWorkspaceSchema>
>;
