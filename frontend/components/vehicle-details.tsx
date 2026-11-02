import { cn } from "@/lib/utils";
import type { Vehicle } from "@/lib/vehicles";

const mileageFormatter = new Intl.NumberFormat("en-US");

/**
 * A vehicle's details as a label/value list. The compact variant, for cards
 * that already name the vehicle in their title, lists make, trim, mileage and
 * VIN and truncates long values; the full variant also lists the model and
 * wraps every value. The VIN always wraps.
 */
export function VehicleDetails({
  vehicle,
  variant = "compact",
  className,
}: {
  vehicle: Vehicle;
  variant?: "compact" | "full";
  className?: string;
}) {
  const full = variant === "full";

  return (
    <dl
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5",
        className,
      )}
    >
      <VehicleDetail
        label="Make"
        wrap={full}
      >
        {vehicle.make}
      </VehicleDetail>
      {full && (
        <VehicleDetail
          label="Model"
          wrap
        >
          {vehicle.model}
        </VehicleDetail>
      )}
      <VehicleDetail
        label="Trim"
        wrap={full}
      >
        {vehicle.trim}
      </VehicleDetail>
      <VehicleDetail
        label="Mileage"
        wrap={full}
      >
        {vehicle.mileage !== null &&
          `${mileageFormatter.format(vehicle.mileage)} mi`}
      </VehicleDetail>
      <VehicleDetail
        label="VIN"
        wrap
        breakAnywhere
      >
        {vehicle.vin}
      </VehicleDetail>
    </dl>
  );
}

function VehicleDetail({
  label,
  wrap = false,
  breakAnywhere = false,
  children,
}: {
  label: string;
  /** Wraps the value across lines instead of truncating it. */
  wrap?: boolean;
  /** Breaks a wrapped value between any two characters, not just words. */
  breakAnywhere?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-right",
          !wrap && "truncate",
          wrap && (breakAnywhere ? "break-all" : "break-words"),
        )}
      >
        {children || <span className="text-muted-foreground">-</span>}
      </dd>
    </>
  );
}
