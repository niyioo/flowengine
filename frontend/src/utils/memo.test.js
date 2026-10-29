import { describe, expect, it } from "vitest";
import { daysSince, formatDuration, formatWaiting } from "./memo";

const NOW = new Date("2026-10-25T12:00:00Z").getTime();
const ago = (hours) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();

describe("formatWaiting", () => {
  it("reads naturally at each scale", () => {
    expect(formatWaiting(ago(0.2), NOW)).toBe("Just arrived");
    expect(formatWaiting(ago(5), NOW)).toBe("Waiting 5 h");
    expect(formatWaiting(ago(24), NOW)).toBe("Waiting 1 day");
    expect(formatWaiting(ago(80), NOW)).toBe("Waiting 3 days");
  });
});

describe("daysSince", () => {
  it("counts whole days", () => {
    expect(daysSince(ago(47), NOW)).toBe(1);
    expect(daysSince(ago(49), NOW)).toBe(2);
  });
});

describe("formatDuration", () => {
  it("switches from hours to days", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(6.5)).toBe("6.5 h");
    expect(formatDuration(36)).toBe("1.5 days");
  });
});
