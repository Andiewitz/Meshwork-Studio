/** A cumulative histogram series from Prometheus exposition. */
export interface HistogramSeries {
  sum: number;
  count: number;
}
export type HistogramSnapshot = Map<string, HistogramSeries>;

/** Read matching _sum and _count samples, never the cumulative buckets. */
export function readDurationHistogram(metrics: string): HistogramSnapshot {
  const partial = new Map<string, Partial<HistogramSeries>>();
  const pattern =
    /^http_request_duration_seconds_(sum|count)(\{.*\})?\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*$/;
  for (const line of metrics.split("\n")) {
    const match = pattern.exec(line.trim());
    if (!match) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value) || value < 0) continue;
    const labels = match[2] ?? "";
    const item = partial.get(labels) ?? {};
    if (match[1] === "sum") item.sum = value;
    else item.count = value;
    partial.set(labels, item);
  }
  const result: HistogramSnapshot = new Map();
  for (const [labels, value] of partial) {
    if (value.sum !== undefined && value.count !== undefined)
      result.set(labels, { sum: value.sum, count: value.count });
  }
  return result;
}

/** Mean over newly observed requests, with per-series counter reset handling. */
export function intervalMeanMs(
  current: HistogramSnapshot,
  previous: HistogramSnapshot,
): number {
  let duration = 0;
  let count = 0;
  for (const [labels, sample] of current) {
    const old = previous.get(labels);
    const reset = old && (sample.count < old.count || sample.sum < old.sum);
    duration += sample.sum - (old && !reset ? old.sum : 0);
    count += sample.count - (old && !reset ? old.count : 0);
  }
  return count > 0 ? (duration / count) * 1000 : 0;
}
