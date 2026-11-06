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
      { id: 3, performed_at: "2026-10-12" },
      { id: 2, performed_at: "2026-01-18" },
      { id: 1, performed_at: "2025-09-21" },
    ];

    expect(groupByYear(records)).toEqual([
      { year: "2026", records: [records[0], records[1]] },
      { year: "2025", records: [records[2]] },
    ]);
  });
});

describe("formatting", () => {
  it("formats mileage with thousands separators", () => {
    expect(formatMileage(182000)).toBe("182,000 mi");
  });

  it("formats cost as USD with cents", () => {
    expect(formatCost("1234.5")).toBe("$1,234.50");
  });

  it("formats service dates on the same calendar day", () => {
    expect(formatDay("2026-01-01")).toBe("Jan 1");
    expect(formatFullDate("2025-12-31")).toBe("Dec 31, 2025");
  });
});
