"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import {
  PencilSimpleIcon,
  SpinnerIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  deleteMaintenanceRecordAction,
  updateMaintenanceRecordAction,
  type DeleteMaintenanceResult,
} from "@/app/(authenticated)/vehicles/[id]/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MaintenanceRecordDialog } from "@/components/maintenance-record-dialog";
import { MaintenanceTypeIcon } from "@/components/maintenance-type-icon";
import { Button } from "@/components/ui/button";
import type { MaintenanceRecord } from "@/lib/maintenance";
import {
  formatCost,
  formatDay,
  formatFullDate,
  formatMileage,
  formatRecordName,
} from "@/lib/maintenance-format";
import { MAINTENANCE_TYPE_LABELS } from "@/lib/maintenance-schema";
import { cn } from "@/lib/utils";

export type TimelineRecord = MaintenanceRecord & { pending?: boolean };

export function MaintenanceRecordItem({ record }: { record: TimelineRecord }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSession, setEditSession] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useOptimistic(false);
  const [, startTransition] = useTransition();
  const notesId = useId();
  const name = formatRecordName(record);
  const details = [
    record.mileage !== null && formatMileage(record.mileage),
    record.cost !== null && formatCost(record.cost),
  ].filter((detail) => detail !== false);

  function deleteRecord() {
    setConfirmOpen(false);
    startTransition(async () => {
      setDeleting(true);

      let result: DeleteMaintenanceResult;

      try {
        result = await deleteMaintenanceRecordAction(
          record.vehicle_id,
          record.id,
        );
      } catch (error) {
        unstable_rethrow(error);
        result = {
          ok: false,
          error: "Could not reach the server. Please try again.",
        };
      }

      if (result.ok) {
        toast.success("Maintenance record deleted");
      } else {
        toast.error("Could not delete the record", {
          description: result.error,
        });
      }
    });
  }

  if (deleting) {
    return null;
  }

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
        <MaintenanceTypeIcon type={record.type} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-medium">
                {MAINTENANCE_TYPE_LABELS[record.type]}
              </span>
              <time
                dateTime={record.performed_at}
                title={formatFullDate(record.performed_at)}
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
                onClick={() => {
                  setEditSession(editSession + 1);
                  setEditOpen(true);
                }}
                aria-label={`Edit ${name}`}
              >
                <PencilSimpleIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmOpen(true)}
                aria-label={`Delete ${name}`}
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
      {!record.pending && (
        <>
          <MaintenanceRecordDialog
            key={editSession}
            record={record}
            action={updateMaintenanceRecordAction.bind(
              null,
              record.vehicle_id,
              record.id,
            )}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete this record?"
            description={`${name} will be permanently deleted.`}
            confirmLabel="Delete"
            destructive
            onConfirm={deleteRecord}
          />
        </>
      )}
    </li>
  );
}
