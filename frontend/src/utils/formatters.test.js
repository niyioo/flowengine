import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDate, formatNumber, todayISO } from "./formatters";

describe("formatNumber", () => {
  it("formats decimals and strings from the API", () => {
    expect(formatNumber("1234.5")).toBe("1,234.5");
    expect(formatNumber(28, 0)).toBe("28");
  });

  it.each([null, undefined, "abc"])("shows a dash for %s", (value) => {
    expect(formatNumber(value)).toBe("—");
  });
});

describe("formatDate", () => {
  it("does not shift plain dates across timezones", () => {
    expect(formatDate("2026-03-01")).toMatch(/1 Mar 2026/);
  });

  it("shows a dash for empty values", () => {
    expect(formatDate(null)).toBe("—");
  });
});

describe("todayISO", () => {
  afterEach(() => vi.useRealTimers());

  it("uses the local calendar date, not UTC", () => {
    // 00:30 local on 20 May — in UTC+1 (Lagos) that is still 19 May in UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 0, 30));
    expect(todayISO()).toBe("2026-05-20");
  });
});
