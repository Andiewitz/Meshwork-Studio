import { z } from "zod";
import { wireTimestampSchema } from "./events";

// These describe the existing JSON response shape, not database rows.
const timestamp = wireTimestampSchema.nullable();
export const collectionDtoSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  userId: z.string().nullable(),
  parentId: z.number().nullable(),
  createdAt: timestamp,
});
export const workspaceDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  icon: z.string().nullable(),
  isFavorite: z.boolean().nullable(),
  userId: z.string().nullable(),
  collectionId: z.number().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  description: z.string().nullable(),
  author: z.string().nullable(),
  aiContext: z.string().nullable(),
  groups: z.array(z.string()).nullable(),
  tags: z.array(z.string()).nullable(),
  canvasCopyStatus: z.enum(["ready", "copying", "failed"]),
  canvasCopySourceId: z.string().nullable(),
});
export const teamDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  inviteCode: z.string(),
  ownerId: z.string(),
  createdAt: timestamp,
});
export const teamMemberDtoSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  userId: z.string(),
  role: z.string(),
  color: z.string(),
  joinedAt: timestamp,
});
export const teamWorkspaceDtoSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  workspaceId: z.string(),
  sharedAt: timestamp,
});
export type CollectionDto = z.infer<typeof collectionDtoSchema>;
export type WorkspaceDto = z.infer<typeof workspaceDtoSchema>;
export type TeamDto = z.infer<typeof teamDtoSchema>;
export type TeamMemberDto = z.infer<typeof teamMemberDtoSchema>;
export type TeamWorkspaceDto = z.infer<typeof teamWorkspaceDtoSchema>;
