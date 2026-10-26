export class CanvasWriteIncompleteError extends Error {
  readonly code = "CANVAS_WRITE_INCOMPLETE";
  readonly retryable = true;
  constructor(
    readonly remainingItems: number,
    readonly attempts: number,
  ) {
    super(
      `DynamoDB did not process ${remainingItems} canvas write${remainingItems === 1 ? "" : "s"} after ${attempts} attempts`,
    );
    this.name = "CanvasWriteIncompleteError";
  }
}

export class CanvasRevisionConflictError extends Error {
  readonly code = "CANVAS_REVISION_CONFLICT";
  constructor(
    readonly expectedRevision: number,
    readonly currentRevision: number,
  ) {
    super(
      `Canvas revision ${expectedRevision} is stale; current revision is ${currentRevision}`,
    );
    this.name = "CanvasRevisionConflictError";
  }
}

export class CanvasWriteLockedError extends Error {
  readonly code = "CANVAS_WRITE_IN_PROGRESS";
  readonly retryable = true;
  constructor() {
    super("Another canvas save is in progress");
    this.name = "CanvasWriteLockedError";
  }
}

/** Uses the existing incomplete-write response; no new public error envelope. */
export class CanvasDeletedError extends CanvasWriteIncompleteError {
  constructor() {
    super(0, 0);
    this.name = "CanvasDeletedError";
  }
}
