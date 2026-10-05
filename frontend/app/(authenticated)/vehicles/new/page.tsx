import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { VehicleForm } from "@/components/vehicle-form";
import { createVehicleAction } from "../actions";

export const metadata: Metadata = { title: "Add vehicle - Otto" };

const emptyValues = {
  year: "",
  make: "",
  model: "",
  trim: "",
  nickname: "",
  mileage: "",
  vin: "",
};

export default function NewVehiclePage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        backHref="/vehicles"
        backLabel="Vehicles"
        title="Add vehicle"
        description="Add a vehicle to your garage in two quick steps."
      />
      <VehicleForm
        action={createVehicleAction}
        defaultValues={emptyValues}
        submitLabel="Add vehicle"
        cancelHref="/vehicles"
      />
    </div>
  );
}
