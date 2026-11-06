import {
  MaintenanceRecordItem,
  type TimelineRecord,
} from "@/components/maintenance-record-item";
import { groupByYear } from "@/lib/maintenance-format";

export function MaintenanceTimeline({
  records,
}: {
  /** Newest first. */
  records: readonly TimelineRecord[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {groupByYear(records).map(({ year, records }) => (
        <section
          key={year}
          aria-labelledby={`maintenance-year-${year}`}
        >
          <h3
            id={`maintenance-year-${year}`}
            className="mb-3 font-heading text-xs font-semibold text-muted-foreground tabular-nums"
          >
            {year}
          </h3>
          <ol className="flex flex-col">
            {records.map((record) => (
              <MaintenanceRecordItem
                key={record.id}
                record={record}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
