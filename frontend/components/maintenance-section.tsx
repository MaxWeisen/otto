"use client";

import { startTransition, useOptimistic, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import {
  ClipboardTextIcon,
  DiscIcon,
  DropIcon,
  PencilSimpleIcon,
  PlusIcon,
  TireIcon,
  ToolboxIcon,
  TrashIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import {
  createMaintenanceRecordAction,
  deleteMaintenanceRecordAction,
  updateMaintenanceRecordAction,
  type DeleteMaintenanceResult,
} from "@/app/(authenticated)/vehicles/[id]/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { MaintenanceRecordForm } from "@/components/maintenance-record-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MaintenanceRecord } from "@/lib/maintenance";
import {
  MAINTENANCE_TYPE_LABELS,
  formatCost,
  formatDay,
  formatMileage,
  formatRecordName,
  groupByYear,
} from "@/lib/maintenance-format";
import type { Vehicle } from "@/lib/vehicles";

const TYPE_ICONS = {
  oil_change: DropIcon,
  tire_rotation: TireIcon,
  brakes: DiscIcon,
  inspection: ClipboardTextIcon,
  repair: WrenchIcon,
  other: ToolboxIcon,
};

export function MaintenanceSection({
  vehicle,
  records,
}: {
  vehicle: Vehicle;
  records: MaintenanceRecord[];
}) {
  const [shown, remove] = useOptimistic(records, (current, id: number) =>
    current.filter((record) => record.id !== id),
  );
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MaintenanceRecord>();
  const [deleting, setDeleting] = useState<MaintenanceRecord>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [openNotes, setOpenNotes] = useState<number[]>([]);
  const heading = useRef<HTMLDivElement>(null);
  const addRecord = useRef<HTMLButtonElement>(null);
  const confirmed = useRef(false);

  function deleteRecord(record: MaintenanceRecord) {
    confirmed.current = true;
    setConfirmOpen(false);
    startTransition(async () => {
      remove(record.id);
      const result: DeleteMaintenanceResult =
        await deleteMaintenanceRecordAction(record.vehicle_id, record.id).catch(
          (error) => {
            unstable_rethrow(error);
            return {
              ok: false,
              error: "Could not reach the server. Please try again.",
            };
          },
        );

      if (result.ok) {
        toast.success("Maintenance record deleted");
      } else {
        toast.error("Could not delete the record", {
          description: result.error,
        });
      }
    });
  }

  function toggleNotes(id: number) {
    setOpenNotes(
      openNotes.includes(id)
        ? openNotes.filter((open) => open !== id)
        : [...openNotes, id],
    );
  }

  const addButton = (
    label: string,
    size?: "sm",
    ref?: React.Ref<HTMLButtonElement>,
  ) => (
    <Button
      ref={ref}
      size={size}
      onClick={() => setAdding(true)}
    >
      <PlusIcon data-icon="inline-start" />
      {label}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle
          ref={heading}
          role="heading"
          aria-level={2}
          tabIndex={-1}
          className="outline-none"
        >
          Maintenance
        </CardTitle>
        {shown.length > 0 && (
          <CardAction className="row-span-1 -my-1.5">
            {addButton("Add record", "sm", addRecord)}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <EmptyState
            className="border py-10"
            icon={<WrenchIcon />}
            title="No maintenance logged yet"
            description="Keep a history of oil changes, repairs and inspections for this vehicle."
            action={addButton("Add your first record")}
          />
        ) : (
          <div className="flex flex-col gap-6 border-t pt-4">
            {groupByYear(shown).map(({ year, records }) => (
              <section
                key={year}
                aria-labelledby={`maintenance-${year}`}
              >
                <h3
                  id={`maintenance-${year}`}
                  className="mb-3 font-heading text-xs font-semibold text-muted-foreground tabular-nums"
                >
                  {year}
                </h3>
                <ol className="flex flex-col">
                  {records.map((record) => {
                    const Icon = TYPE_ICONS[record.type];
                    const name = formatRecordName(record);
                    const notesOpen = openNotes.includes(record.id);

                    return (
                      <li
                        key={record.id}
                        className="group/entry relative flex gap-3 pb-5 last:pb-0"
                      >
                        <span
                          aria-hidden
                          className="absolute top-8 bottom-0 left-[15px] w-px bg-border group-last/entry:hidden"
                        />
                        <span
                          aria-hidden
                          className="relative flex size-8 shrink-0 items-center justify-center border bg-card text-muted-foreground"
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <p className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-medium">
                                  {MAINTENANCE_TYPE_LABELS[record.type]}
                                </span>
                                <time
                                  dateTime={record.performed_at}
                                  className="text-muted-foreground"
                                >
                                  {formatDay(record.performed_at)}
                                </time>
                              </p>
                              <p className="leading-relaxed break-words">
                                {record.description}
                              </p>
                            </div>
                            <div className="-my-1 -mr-1.5 flex shrink-0">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Edit ${name}`}
                                onClick={() => setEditing(record)}
                              >
                                <PencilSimpleIcon />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Delete ${name}`}
                                onClick={() => {
                                  confirmed.current = false;
                                  setDeleting(record);
                                  setConfirmOpen(true);
                                }}
                              >
                                <TrashIcon />
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground tabular-nums empty:hidden">
                            {record.mileage !== null && (
                              <span>{formatMileage(record.mileage)}</span>
                            )}
                            {record.cost !== null && (
                              <span>{formatCost(record.cost)}</span>
                            )}
                            {record.notes && (
                              <button
                                type="button"
                                aria-expanded={notesOpen}
                                aria-controls={`notes-${record.id}`}
                                onClick={() => toggleNotes(record.id)}
                                className="font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring/50"
                              >
                                {notesOpen ? "Less" : "More"}
                              </button>
                            )}
                          </div>
                          {record.notes && (
                            <p
                              id={`notes-${record.id}`}
                              hidden={!notesOpen}
                              className="mt-1 border-l-2 pl-3 leading-relaxed break-words whitespace-pre-wrap text-muted-foreground"
                            >
                              {record.notes}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </CardContent>
      {adding && (
        <MaintenanceRecordForm
          defaultMileage={vehicle.mileage}
          action={createMaintenanceRecordAction.bind(null, vehicle.id)}
          onClose={() => setAdding(false)}
        />
      )}
      {editing && (
        <MaintenanceRecordForm
          record={editing}
          action={updateMaintenanceRecordAction.bind(
            null,
            editing.vehicle_id,
            editing.id,
          )}
          onClose={() => setEditing(undefined)}
        />
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this record?"
        description={
          deleting &&
          `${formatRecordName(deleting)} will be permanently deleted.`
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleting && deleteRecord(deleting)}
        finalFocus={() =>
          !confirmed.current || (addRecord.current ?? heading.current)
        }
      />
    </Card>
  );
}
