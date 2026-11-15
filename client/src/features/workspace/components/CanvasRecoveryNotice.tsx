import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export function CanvasRecoveryNotice({
  disabled,
  onExport,
  onLoadSaved,
}: {
  disabled: boolean;
  onExport: () => void;
  onLoadSaved: () => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function changeOpen(value: boolean) {
    if (busy) return;
    setOpen(value);
    if (!value) {
      setConfirming(false);
      setError("");
    }
  }
  async function loadSaved() {
    setBusy(true);
    setError("");
    try {
      const message = await onLoadSaved();
      if (message) setError(message);
    } catch {
      setError(
        "Could not check the saved version. Your draft is still here; try again when connected.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div
        role="status"
        className="canvas-recovery-notice"
        style={open ? { zIndex: 0 } : undefined}
      >
        <ExclamationTriangleIcon
          aria-hidden="true"
          className="canvas-recovery-icon"
        />
        <div className="min-w-0 flex-1">
          <p className="canvas-recovery-title">Saving paused</p>
          <p className="canvas-recovery-caption">
            Your local draft needs review.
          </p>
        </div>
        <button
          type="button"
          className="canvas-recovery-review"
          onClick={() => setOpen(true)}
        >
          Review
        </button>
      </div>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="workspace-dialog canvas-recovery-dialog w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogTitle>Review your local draft</DialogTitle>
          <DialogDescription className="ws-muted">
            The connection was interrupted or the saved canvas changed. Your
            current work is still in this tab, but automatic saving is paused to
            avoid overwriting other changes.
          </DialogDescription>
          <div className="canvas-recovery-choice">
            <p className="font-semibold ws-ink">Keep a copy of this draft</p>
            <p className="ws-muted">
              Download the canvas you’re looking at before switching versions.
            </p>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={onExport}
              className="canvas-recovery-secondary"
            >
              Export draft
            </button>
          </div>
          <div className="canvas-recovery-choice">
            <p className="font-semibold ws-ink">Load the saved version</p>
            <p className="ws-muted">
              Replace this local draft with the version on the server. Export
              first if you want to keep this draft.
            </p>
            {!confirming ? (
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => setConfirming(true)}
                className="canvas-recovery-secondary"
              >
                Load saved version
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm ws-ink">
                  Discard this local draft and reload?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirming(false)}
                    className="canvas-recovery-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => void loadSaved()}
                    className="canvas-recovery-primary ws-primary"
                  >
                    {busy ? "Checking connection…" : "Discard and reload"}
                  </button>
                </div>
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm ws-error-text">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => changeOpen(false)}
            className="canvas-recovery-dismiss"
          >
            Keep viewing draft
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
