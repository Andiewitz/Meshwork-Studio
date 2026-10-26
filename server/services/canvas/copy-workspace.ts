import type { WorkspaceSummaryReader } from "@services/workspace/public";

export interface CanvasDocuments {
  duplicateCanvas(
    sourceId: string,
    targetId: string,
    operationId: string,
  ): Promise<void>;
}

/** An obsolete command is acknowledged; an unavailable dependency must be retried. */
export async function copyWorkspaceCanvas(
  workspaces: WorkspaceSummaryReader,
  documents: CanvasDocuments,
  sourceId: string,
  targetId: string,
  operationId: string,
): Promise<"completed" | "obsolete"> {
  const target = await workspaces.lookup(targetId);
  if (target.status === "unavailable") throw target.cause;
  if (
    target.status === "missing" ||
    target.value.canvasCopyStatus !== "copying"
  )
    return "obsolete";
  await documents.duplicateCanvas(sourceId, targetId, operationId);
  return "completed";
}
