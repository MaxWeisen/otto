import { format, getYear, parseISO } from "date-fns";
import {
  MAINTENANCE_TYPE_LABELS,
  type MaintenanceType,
} from "@/lib/maintenance-schema";

const mileageFormatter = new Intl.NumberFormat("en-US");
const costFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatMileage(mileage: number): string {
  return `${mileageFormatter.format(mileage)} mi`;
}

export function formatCost(cost: string): string {
  return costFormatter.format(cost as Intl.StringNumericLiteral);
}

export function formatDay(date: string): string {
  return format(parseISO(date), "MMM d");
}

export function formatFullDate(date: string): string {
  return format(parseISO(date), "MMM d, yyyy");
}

export function formatRecordName(record: {
  type: MaintenanceType;
  performed_at: string;
}): string {
  return `${MAINTENANCE_TYPE_LABELS[record.type]} from ${formatFullDate(record.performed_at)}`;
}

export function groupByYear<T extends { performed_at: string }>(
  records: readonly T[],
): { year: string; records: T[] }[] {
  const groups: { year: string; records: T[] }[] = [];

  for (const record of records) {
    const year = String(getYear(parseISO(record.performed_at)));
    const last = groups.at(-1);

    if (last?.year === year) {
      last.records.push(record);
    } else {
      groups.push({ year, records: [record] });
    }
  }

  return groups;
}
