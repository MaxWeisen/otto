import { describe, expect, it } from "vitest";
import {
  formatCost,
  formatDay,
  formatFullDate,
  formatMileage,
  groupByYear,
} from "@/lib/maintenance-format";

describe("groupByYear", () => {
  it("groups newest-first records by year, keeping their order", () => {
    const records = [
      { id: 4, performed_at: "2026-10-12" },
      { id: 3, performed_at: "2026-01-18" },
      { id: 2, performed_at: "2025-09-21" },
      { id: 1, performed_at: "2024-03-14" },
    ];

    expect(groupByYear(records)).toEqual([
      { year: "2026", records: [records[0], records[1]] },
      { year: "2025", records: [records[2]] },
      { year: "2024", records: [records[3]] },
    ]);
  });

  it("returns no groups for no records", () => {
    expect(groupByYear([])).toEqual([]);
  });
});

describe("formatting", () => {
  it("formats mileage with thousands separators", () => {
    expect(formatMileage(182000)).toBe("182,000 mi");
    expect(formatMileage(0)).toBe("0 mi");
  });

  it("formats cost as USD without losing cents", () => {
    expect(formatCost("49.9")).toBe("$49.90");
    expect(formatCost("1234.56")).toBe("$1,234.56");
    expect(formatCost("99999999.99")).toBe("$99,999,999.99");
  });

  it("formats service dates as calendar days in any time zone", () => {
    expect(formatDay("2026-01-01")).toBe("Jan 1");
    expect(formatFullDate("2025-12-31")).toBe("Dec 31, 2025");
  });
});
