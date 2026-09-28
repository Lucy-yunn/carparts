import * as z from "zod";

/** Admin intake form schemas (docs/spec/admin-tool.md). Node-safe. */

export const sellerProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a display name"),
  contactName: z.string().trim().min(1, "Enter a contact name"),
  contactEmail: z.email("Enter a valid contact email").trim(),
  contactPhone: z.string().trim().optional(),
  locationName: z.string().trim().optional(),
  locationLine1: z.string().trim().optional(),
  locationCity: z.string().trim().min(1, "Enter a city"),
  locationPostcode: z.string().trim().optional(),
  locationCountry: z.string().trim().min(2).default("BG"),
});

export const provisionLoginSchema = z.object({
  loginEmail: z.email("Enter a valid login email").trim(),
});

export const makeSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  country: z.string().trim().optional(),
});

export const modelGroupSchema = z.object({
  makeId: z.string().min(1),
  name: z.string().trim().min(1, "Enter a name"),
});

// A blank year input means "unknown / still in production", never 0. Issue #38.
const optYear = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : undefined))
  .pipe(z.number().int().min(1950).max(2100).optional());

export const generationSchema = z.object({
  modelGroupId: z.string().min(1),
  label: z.string().trim().min(1, "Enter a label"),
  chassisCodes: z.string().trim().optional(), // comma-separated in the form
  productionStart: optYear,
  productionEnd: optYear,
});
