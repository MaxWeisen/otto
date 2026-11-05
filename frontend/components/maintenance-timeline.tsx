"use client";

import { useId, useState } from "react";
import {
  ClipboardTextIcon,
  DiscIcon,
  DropIcon,
  PencilSimpleIcon,
  SpinnerIcon,
  TireIcon,
  ToolboxIcon,
  TrashIcon,
  WrenchIcon,
  type Icon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { MaintenanceRecord } from "@/lib/maintenance";
import {
  formatCost,
  formatDay,
  formatFullDate,
  formatMileage,
  groupByYear,
} from "@/lib/maintenance-format";
import {
  MAINTENANCE_TYPE_LABELS,
  type MaintenanceType,
} from "@/lib/maintenance-schema";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<MaintenanceType, Icon> = {
  oil_change: DropIcon,
  tire_rotation: TireIcon,
  brakes: DiscIcon,
  inspection: ClipboardTextIcon,
  repair: WrenchIcon,
  other: ToolboxIcon,
};

export type TimelineRecord = MaintenanceRecord & { pending?: boolean };

type MaintenanceTimelineProps = {
  /** Newest first. */
  records: readonly TimelineRecord[];
  onEdit: (record: MaintenanceRecord) => void;
  onDelete: (record: MaintenanceRecord) => void;
};

export function MaintenanceTimeline({
  records,
  onEdit,
  onDelete,
}: MaintenanceTimelineProps) {
  return (
    <div className="flex flex-col gap-6">
      {groupByYear(records).map(({ year, records }) => (
        <YearGroup
          key={year}
          year={year}
          records={records}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function YearGroup({
  year,
  records,
  onEdit,
  onDelete,
}: MaintenanceTimelineProps & { year: string }) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="mb-3 font-heading text-xs font-semibold text-muted-foreground tabular-nums"
      >
        {year}
      </h3>
      <ol className="flex flex-col">
        {records.map((record) => (
          <TimelineEntry
            key={record.id}
            record={record}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ol>
    </section>
  );
}

function TimelineEntry({
  record,
  onEdit,
  onDelete,
}: {
  record: TimelineRecord;
  onEdit: (record: MaintenanceRecord) => void;
  onDelete: (record: MaintenanceRecord) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const notesId = useId();
  const TypeIcon = TYPE_ICONS[record.type];
  const label = MAINTENANCE_TYPE_LABELS[record.type];
  const fullDate = formatFullDate(record.performed_at);
  const details = [
    record.mileage !== null && formatMileage(record.mileage),
    record.cost !== null && formatCost(record.cost),
  ].filter((detail) => detail !== false);

  return (
    <li
      aria-busy={record.pending || undefined}
      className={cn(
        "group/entry relative flex gap-3 pb-5 last:pb-0",
        record.pending && "opacity-60",
      )}
    >
      <span
        aria-hidden
        className="absolute top-8 bottom-0 left-[15px] w-px bg-border group-last/entry:hidden"
      />
      <span
        aria-hidden
        className="relative flex size-8 shrink-0 items-center justify-center border bg-card text-muted-foreground"
      >
        <TypeIcon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-medium">{label}</span>
              <time
                dateTime={record.performed_at}
                title={fullDate}
                className="text-muted-foreground"
              >
                {formatDay(record.performed_at)}
              </time>
            </p>
            <p className="text-xs/relaxed break-words">{record.description}</p>
          </div>
          {record.pending ? (
            <span className="flex h-7 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <SpinnerIcon className="size-3.5 animate-spin" />
              Saving...
            </span>
          ) : (
            <div className="-my-1 -mr-1.5 flex shrink-0">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onEdit(record)}
                aria-label={`Edit ${label} from ${fullDate}`}
              >
                <PencilSimpleIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(record)}
                aria-label={`Delete ${label} from ${fullDate}`}
              >
                <TrashIcon />
              </Button>
            </div>
          )}
        </div>
        {(details.length > 0 || record.notes) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
            {details.map((detail) => (
              <span key={detail}>{detail}</span>
            ))}
            {record.notes && (
              <button
                type="button"
                onClick={() => setNotesOpen(!notesOpen)}
                aria-expanded={notesOpen}
                aria-controls={notesId}
                className="font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring/50"
              >
                {notesOpen ? "Less" : "More"}
              </button>
            )}
          </div>
        )}
        {record.notes && (
          <p
            id={notesId}
            hidden={!notesOpen}
            className="mt-1 border-l-2 pl-3 text-xs/relaxed break-words whitespace-pre-wrap text-muted-foreground"
          >
            {record.notes}
          </p>
        )}
      </div>
    </li>
  );
}
