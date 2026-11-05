"use client";

import {
  useActionState,
  useEffect,
  useEffectEvent,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, WrenchIcon } from "@phosphor-icons/react";
import type {
  DeleteMaintenanceResult,
  MaintenanceFormState,
} from "@/app/(authenticated)/vehicles/[id]/actions";
import { MaintenanceRecordDialog } from "@/components/maintenance-record-dialog";
import {
  MaintenanceTimeline,
  type TimelineRecord,
} from "@/components/maintenance-timeline";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { formatFullDate } from "@/lib/maintenance-format";
import {
  MAINTENANCE_TYPE_LABELS,
  readMaintenanceFormValues,
  today,
  validateMaintenanceForm,
  type MaintenanceFormValues,
} from "@/lib/maintenance-schema";
import type { Vehicle } from "@/lib/vehicles";

type FormAction = (
  state: MaintenanceFormState,
  formData: FormData,
) => Promise<MaintenanceFormState>;

type MaintenanceSectionProps = {
  vehicle: Vehicle;
  /** Newest first, as the API lists them. */
  records: MaintenanceRecord[];
  createAction: FormAction;
  updateAction: (
    recordId: number,
    state: MaintenanceFormState,
    formData: FormData,
  ) => Promise<MaintenanceFormState>;
  deleteAction: (recordId: number) => Promise<DeleteMaintenanceResult>;
};

type OptimisticChange =
  { kind: "add"; record: TimelineRecord } | { kind: "delete"; id: number };

const mileageFormatter = new Intl.NumberFormat("en-US");
const UNREACHABLE = "Could not reach the server. Please try again.";

// A server action call rejects when the request never reaches the server,
// which would otherwise take down the page through the error boundary.
async function submitForm(
  action: FormAction,
  previous: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  try {
    return await action(previous, formData);
  } catch (error) {
    unstable_rethrow(error);
    return {
      values: readMaintenanceFormValues(formData),
      message: UNREACHABLE,
    };
  }
}

function newestFirst(a: TimelineRecord, b: TimelineRecord): number {
  return (
    b.performed_at.localeCompare(a.performed_at) ||
    Number(!!b.pending) - Number(!!a.pending) ||
    b.id - a.id
  );
}

function recordFormValues(record: MaintenanceRecord): MaintenanceFormValues {
  return {
    type: record.type,
    performed_at: record.performed_at,
    description: record.description,
    mileage:
      record.mileage === null ? "" : mileageFormatter.format(record.mileage),
    cost: record.cost ?? "",
    notes: record.notes ?? "",
  };
}

function recordName(record: MaintenanceRecord): string {
  return `${MAINTENANCE_TYPE_LABELS[record.type]} from ${formatFullDate(record.performed_at)}`;
}

export function MaintenanceSection({
  vehicle,
  records,
  createAction,
  updateAction,
  deleteAction,
}: MaintenanceSectionProps) {
  const [optimisticRecords, applyOptimistic] = useOptimistic(
    records as TimelineRecord[],
    (current, change: OptimisticChange) =>
      change.kind === "add"
        ? [...current, change.record].sort(newestFirst)
        : current.filter((record) => record.id !== change.id),
  );
  const nextPendingId = useRef(0);
  const addButton = useRef<HTMLButtonElement>(null);

  const freshAddState = (): MaintenanceFormState => ({
    values: {
      type: "",
      performed_at: today(),
      description: "",
      mileage:
        vehicle.mileage === null
          ? ""
          : mileageFormatter.format(vehicle.mileage),
      cost: "",
      notes: "",
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addState, setAddState] = useState<MaintenanceFormState | null>(null);
  const [editing, setEditing] = useState<MaintenanceRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSession, setEditSession] = useState(0);
  const [deleting, setDeleting] = useState<MaintenanceRecord | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteConfirmed = useRef(false);
  const [, startTransition] = useTransition();

  function openAdd(state: MaintenanceFormState = freshAddState()) {
    setAddState(state);
    setAddOpen(true);
  }

  // The dialog closes as soon as the form is valid; the new record shows as
  // pending in the timeline until the server answers.
  const [createState, createFormAction] = useActionState(
    async (previous: MaintenanceFormState, formData: FormData) => {
      const validation = validateMaintenanceForm(
        readMaintenanceFormValues(formData),
      );

      if (validation.success) {
        nextPendingId.current -= 1;
        applyOptimistic({
          kind: "add",
          record: {
            ...validation.data,
            id: nextPendingId.current,
            vehicle_id: vehicle.id,
            created_at: new Date().toISOString(),
            pending: true,
          },
        });
      }

      return submitForm(createAction, previous, formData);
    },
    { values: freshAddState().values },
  );

  const handleCreateResult = useEffectEvent((result: MaintenanceFormState) => {
    if (result.saved) {
      toast.success("Maintenance record added");
      return;
    }

    const message =
      result.message ?? Object.values(result.errors ?? {}).flat()[0];

    if (message) {
      toast.error("Could not add the record", {
        description: message,
        action: { label: "Try again", onClick: () => openAdd(result) },
      });
    }
  });

  useEffect(() => {
    handleCreateResult(createState);
  }, [createState]);

  function startEditing(record: MaintenanceRecord) {
    setEditing(record);
    setEditSession(editSession + 1);
    setEditOpen(true);
  }

  function confirmDelete(record: MaintenanceRecord) {
    deleteConfirmed.current = false;
    setDeleting(record);
    setDeleteOpen(true);
  }

  function deleteRecord(record: MaintenanceRecord) {
    deleteConfirmed.current = true;
    setDeleteOpen(false);
    startTransition(async () => {
      applyOptimistic({ kind: "delete", id: record.id });

      let result: DeleteMaintenanceResult;
      try {
        result = await deleteAction(record.id);
      } catch (error) {
        unstable_rethrow(error);
        result = { ok: false, error: UNREACHABLE };
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

  const addButtonProps = {
    ref: addButton,
    onClick: () => openAdd(),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle
          role="heading"
          aria-level={2}
        >
          Maintenance
        </CardTitle>
        {optimisticRecords.length > 0 && (
          <CardAction className="row-span-1 -my-1.5">
            <Button
              size="sm"
              {...addButtonProps}
            >
              <PlusIcon data-icon="inline-start" />
              Add record
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {optimisticRecords.length > 0 ? (
          <div className="border-t pt-4">
            <MaintenanceTimeline
              records={optimisticRecords}
              onEdit={startEditing}
              onDelete={confirmDelete}
            />
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
              <Button {...addButtonProps}>
                <PlusIcon data-icon="inline-start" />
                Add your first record
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </CardContent>

      {addState && (
        <MaintenanceRecordDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          title="Add maintenance record"
          description="Log service done on this vehicle."
          submitLabel="Add record"
          state={addState}
          action={createFormAction}
          onValidSubmit={() => setAddOpen(false)}
        />
      )}

      {editing && (
        <EditRecordDialog
          key={editSession}
          record={editing}
          open={editOpen}
          onOpenChange={setEditOpen}
          action={updateAction.bind(null, editing.id)}
        />
      )}

      <AlertDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      >
        <AlertDialogContent
          finalFocus={() =>
            deleteConfirmed.current ? addButton.current : true
          }
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting &&
                `${recordName(deleting)} will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleting && deleteRecord(deleting)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function EditRecordDialog({
  record,
  open,
  onOpenChange,
  action,
}: {
  record: MaintenanceRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: FormAction;
}) {
  const [state, formAction, pending] = useActionState(
    (previous: MaintenanceFormState, formData: FormData) =>
      submitForm(action, previous, formData),
    { values: recordFormValues(record) },
  );

  const handleResult = useEffectEvent((result: MaintenanceFormState) => {
    if (result.saved) {
      toast.success("Maintenance record updated");
      onOpenChange(false);
    }
  });

  useEffect(() => {
    handleResult(state);
  }, [state]);

  return (
    <MaintenanceRecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit maintenance record"
      description={recordName(record)}
      submitLabel="Save"
      state={state}
      action={formAction}
      pending={pending}
    />
  );
}
