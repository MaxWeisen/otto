/**
 * Common US-market vehicle manufacturers, alphabetical.
 *
 * Source: NHTSA Vehicle Product Information Catalog (vPIC), which is in the
 * public domain. Names are title-cased from vPIC's uppercase make names.
 */
export const VEHICLE_MAKES = [
  "Acura",
  "Alfa Romeo",
  "Aston Martin",
  "Audi",
  "Bentley",
  "BMW",
  "Buick",
  "Cadillac",
  "Chevrolet",
  "Chrysler",
  "Dodge",
  "Ferrari",
  "Fiat",
  "Fisker",
  "Ford",
  "Genesis",
  "GMC",
  "Honda",
  "Hummer",
  "Hyundai",
  "Infiniti",
  "Isuzu",
  "Jaguar",
  "Jeep",
  "Kia",
  "Lamborghini",
  "Land Rover",
  "Lexus",
  "Lincoln",
  "Lotus",
  "Lucid",
  "Maserati",
  "Mazda",
  "McLaren",
  "Mercedes-Benz",
  "Mercury",
  "Mini",
  "Mitsubishi",
  "Nissan",
  "Oldsmobile",
  "Polestar",
  "Pontiac",
  "Porsche",
  "Ram",
  "Rivian",
  "Rolls-Royce",
  "Saab",
  "Saturn",
  "Scion",
  "Smart",
  "Subaru",
  "Suzuki",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo",
] as const;

export type VehicleMake = (typeof VEHICLE_MAKES)[number];

export function findVehicleMake(name: string): VehicleMake | undefined {
  const normalized = name.trim().toLowerCase();

  return VEHICLE_MAKES.find((make) => make.toLowerCase() === normalized);
}
