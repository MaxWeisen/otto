"use client";

import { startTransition, useOptimistic, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { compareDesc, format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  ClipboardTextIcon,
  DiscIcon,
  DropIcon,
  PencilSimpleIcon,
  PlusIcon,
  SpinnerIcon,
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
  type MaintenanceFormState,
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
  type MaintenanceType,
} from "@/lib/maintenance-format";
import type { Vehicle } from "@/lib/vehicles";
import { cn } from "@/lib/utils";

const TYPE_ICONS = {
  oil_change: DropIcon,
  tire_rotation: TireIcon,
  brakes: DiscIcon,
  inspection: ClipboardTextIcon,
  repair: WrenchIcon,
  other: ToolboxIcon,
};

type ShownRecord = MaintenanceRecord & { pending?: boolean };
type Change = { add: ShownRecord } | { remove: number };

function applyChange(records: ShownRecord[], change: Change) {
  if ("remove" in change) {
    return records.filter((record) => record.id !== change.remove);
  }

  return [change.add, ...records].sort((a, b) =>
    compareDesc(parseISO(a.performed_at), parseISO(b.performed_at)),
  );
}

function pendingRecord(vehicleId: number, formData: FormData): ShownRecord {
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const type = field("type");

  return {
    id: -Date.now(),
    vehicle_id: vehicleId,
    type: type in TYPE_ICONS ? (type as MaintenanceType) : "other",
    description: field("description"),
    performed_at: field("performed_at") || format(new Date(), "yyyy-MM-dd"),
    mileage: null,
    cost: null,
    notes: null,
    created_at: "",
    pending: true,
  };
}

export function MaintenanceSection({
  vehicle,
  records,
}: {
  vehicle: Vehicle;
  records: MaintenanceRecord[];
}) {
  const [shown, change] = useOptimistic<ShownRecord[], Change>(
    records,
    applyChange,
  );
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MaintenanceRecord>();
  const [deleting, setDeleting] = useState<MaintenanceRecord>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [openNotes, setOpenNotes] = useState<number[]>([]);

  async function create(state: MaintenanceFormState, formData: FormData) {
    change({ add: pendingRecord(vehicle.id, formData) });
    return createMaintenanceRecordAction(vehicle.id, state, formData);
  }

  function deleteRecord(record: MaintenanceRecord) {
    setConfirmOpen(false);
    startTransition(async () => {
      change({ remove: record.id });
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

  const addButton = (label: string, size?: "sm") => (
    <Button
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
          role="heading"
          aria-level={2}
        >
          Maintenance
        </CardTitle>
        {shown.length > 0 && (
          <CardAction className="row-span-1 -my-1.5">
            {addButton("Add record", "sm")}
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
                            {record.pending ? (
                              <span className="flex h-7 shrink-0 items-center gap-1.5 text-muted-foreground">
                                <SpinnerIcon className="size-3.5 animate-spin" />
                                Saving...
                              </span>
                            ) : (
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
                                    setDeleting(record);
                                    setConfirmOpen(true);
                                  }}
                                >
                                  <TrashIcon />
                                </Button>
                              </div>
                            )}
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
          action={create}
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
      />
    </Card>
  );
}
