import * as z from "zod";

/** DonorVehicle + Listing intake form schemas (docs/spec/admin-tool.md §6). Node-safe. */

// Absent → undefined ("leave as is"); submitted blank → null ("clear it"). Issue #38.
const optNum = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "" ? null : Number(v)))
  .pipe(z.number().nullable().optional());

const opt = z.string().trim().optional();

export const donorVehicleSchema = z.object({
  sellerId: z.string().min(1, "Choose a seller"),
  generationId: z.string().min(1, "Choose a generation"),
  label: z.string().trim().min(1, "Enter a staff label"),
  donorYear: optNum,
  vin: opt,
  vinDerivedNotes: opt,
  mileageKm: optNum,
  registrationCountry: opt,
  notes: opt,
  scrapReason: opt,
  engine: opt,
  engineCode: opt,
  fuel: opt,
  transmission: z.enum(["manual", "automatic", "other"]).optional(),
  bodyStyle: opt,
  drivetrain: opt,
});

const decimal = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 120.00");
const optDecimal = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d+(\.\d{1,3})?$/.test(v), "Enter a number");

export const listingSchema = z.object({
  partId: z.string().min(1, "Choose a part"),
  priceEur: decimal,
  condition: z.enum(["new", "used_good", "needs_repair"]),
  conditionNotes: opt,
  removalNotes: opt,
  negotiable: z.union([z.literal("on"), z.undefined()]).optional(),
  noVisiblePartNumber: z.union([z.literal("on"), z.undefined()]).optional(),
  sellerSku: opt,
  warehouseLocation: opt,
  lengthCm: optDecimal,
  widthCm: optDecimal,
  heightCm: optDecimal,
  weightKg: optDecimal,
  packageSizeNotes: opt,
});

export const defectSchema = z.object({
  description: z.string().trim().min(1, "Describe the defect"),
});
