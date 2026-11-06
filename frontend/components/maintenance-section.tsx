"use client";

import { useOptimistic, useRef, useState } from "react";
import { compareDesc, parseISO } from "date-fns";
import { PlusIcon, WrenchIcon } from "@phosphor-icons/react";
import {
  createMaintenanceRecordAction,
  type MaintenanceFormState,
} from "@/app/(authenticated)/vehicles/[id]/actions";
import { MaintenanceRecordDialog } from "@/components/maintenance-record-dialog";
import type { TimelineRecord } from "@/components/maintenance-record-item";
import { MaintenanceTimeline } from "@/components/maintenance-timeline";
import { RemoveMaintenanceRecordContext } from "@/components/remove-maintenance-record-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { MaintenanceRecord } from "@/lib/maintenance";
import {
  readMaintenanceFormValues,
  validateMaintenanceForm,
} from "@/lib/maintenance-schema";
import type { Vehicle } from "@/lib/vehicles";

function newestFirst(a: TimelineRecord, b: TimelineRecord): number {
  return (
    compareDesc(parseISO(a.performed_at), parseISO(b.performed_at)) ||
    Number(!!b.pending) - Number(!!a.pending) ||
    b.id - a.id
  );
}

type RecordChange =
  { type: "add"; record: TimelineRecord } | { type: "remove"; id: number };

function applyRecordChange(
  current: TimelineRecord[],
  change: RecordChange,
): TimelineRecord[] {
  if (change.type === "add") {
    return [...current, change.record].sort(newestFirst);
  }

  return current.filter((record) => record.id !== change.id);
}

export function MaintenanceSection({
  vehicle,
  records,
}: {
  vehicle: Vehicle;
  records: MaintenanceRecord[];
}) {
  const [shownRecords, changeShownRecords] = useOptimistic(
    records as TimelineRecord[],
    applyRecordChange,
  );
  const [addOpen, setAddOpen] = useState(false);
  const nextPendingId = useRef(0);

  async function createRecord(
    previous: MaintenanceFormState,
    formData: FormData,
  ) {
    const validation = validateMaintenanceForm(
      readMaintenanceFormValues(formData),
    );

    if (validation.success) {
      nextPendingId.current -= 1;
      changeShownRecords({
        type: "add",
        record: {
          ...validation.data,
          id: nextPendingId.current,
          vehicle_id: vehicle.id,
          created_at: new Date().toISOString(),
          pending: true,
        },
      });
    }

    return createMaintenanceRecordAction(vehicle.id, previous, formData);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle
          role="heading"
          aria-level={2}
        >
          Maintenance
        </CardTitle>
        {shownRecords.length > 0 && (
          <CardAction className="row-span-1 -my-1.5">
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
            >
              <PlusIcon data-icon="inline-start" />
              Add record
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {shownRecords.length > 0 ? (
          <div className="border-t pt-4">
            <RemoveMaintenanceRecordContext
              value={(id) => changeShownRecords({ type: "remove", id })}
            >
              <MaintenanceTimeline records={shownRecords} />
            </RemoveMaintenanceRecordContext>
          </div>
        ) : (
          <Empty className="border py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WrenchIcon />
              </EmptyMedia>
              <EmptyTitle>No maintenance logged yet</EmptyTitle>
              <EmptyDescription>
                Keep a history of oil changes, repairs and inspections for this
                vehicle.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setAddOpen(true)}>
                <PlusIcon data-icon="inline-start" />
                Add your first record
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </CardContent>
      <MaintenanceRecordDialog
        defaultMileage={vehicle.mileage}
        action={createRecord}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </Card>
  );
}
