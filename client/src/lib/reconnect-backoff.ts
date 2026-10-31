/** Retry quickly after transient failures, but back off during repeated short connections. */
export class ReconnectBackoff {
  private delay = 1_000;
  private connectedAt: number | null = null;

  connected(now: number): void {
    this.connectedAt = now;
  }

  nextDelay(now: number): number {
    if (this.connectedAt !== null && now - this.connectedAt >= 30_000) {
      this.delay = 1_000;
    }
    this.connectedAt = null;
    const delay = this.delay;
    this.delay = Math.min(delay * 2, 30_000);
    return delay;
  }
}
