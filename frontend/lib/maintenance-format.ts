const mileageFormatter = new Intl.NumberFormat("en-US");
const costFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
// Dates are calendar days, so they format in UTC to stay on the same day.
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function formatMileage(mileage: number): string {
  return `${mileageFormatter.format(mileage)} mi`;
}

export function formatCost(cost: string): string {
  // Intl formats decimal strings exactly, without going through a float.
  return costFormatter.format(cost as Intl.StringNumericLiteral);
}

export function formatDay(date: string): string {
  return dayFormatter.format(new Date(`${date}T00:00:00Z`));
}

export function formatFullDate(date: string): string {
  return fullDateFormatter.format(new Date(`${date}T00:00:00Z`));
}

export function groupByYear<T extends { performed_at: string }>(
  records: readonly T[],
): { year: string; records: T[] }[] {
  const groups: { year: string; records: T[] }[] = [];

  for (const record of records) {
    const year = record.performed_at.slice(0, 4);
    const last = groups.at(-1);

    if (last?.year === year) {
      last.records.push(record);
    } else {
      groups.push({ year, records: [record] });
    }
  }

  return groups;
}
