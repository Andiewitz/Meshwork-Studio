import { describe, expect, it } from "vitest";
import {
  intervalMeanMs,
  readDurationHistogram,
} from "@services/metrics/collector/duration";
const histogram = (
  aSum: number,
  aCount: number,
  bSum: number,
  bCount: number,
) => `
http_request_duration_seconds_bucket{method="GET",path="/a",le="0.1"} 999
http_request_duration_seconds_sum{method="GET",path="/a"} ${aSum}
http_request_duration_seconds_count{method="GET",path="/a"} ${aCount}
http_request_duration_seconds_sum{method="POST",path="/b"} ${bSum}
http_request_duration_seconds_count{method="POST",path="/b"} ${bCount}
`;
describe("interval latency", () => {
  it("adds sums and counts across routes and ignores cumulative buckets", () => {
    expect(
      intervalMeanMs(readDurationHistogram(histogram(1, 10, 2, 10)), new Map()),
    ).toBe(150);
  });
  it("uses only the new observations in each interval", () => {
    const old = readDurationHistogram(histogram(1, 10, 2, 10));
    const current = readDurationHistogram(histogram(1.2, 12, 2.9, 13));
    expect(intervalMeanMs(current, old)).toBeCloseTo(220);
    expect(intervalMeanMs(current, current)).toBe(0);
  });
  it("handles one series resetting while another keeps its history", () => {
    const old = readDurationHistogram(histogram(5, 50, 2, 10));
    const current = readDurationHistogram(histogram(0.3, 3, 2.8, 14));
    expect(intervalMeanMs(current, old)).toBeCloseTo(1100 / 7);
  });
  it("ignores incomplete and malformed samples", () => {
    const result = readDurationHistogram(
      'http_request_duration_seconds_sum{path="/a"} 1\nhttp_request_duration_seconds_count{path="/b"} 4\nhttp_request_duration_seconds_count{path="/a"} NaN\n',
    );
    expect(result.size).toBe(0);
    expect(intervalMeanMs(result, new Map())).toBe(0);
  });
});
