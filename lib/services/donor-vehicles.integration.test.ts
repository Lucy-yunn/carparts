import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { createDonorVehicle, updateDonorVehicle } from "./donor-vehicles";
import { donorVehicleSchema } from "../validation/intake";

const TAG = `dv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const S = (n: string) => `${TAG}-${n}`;

let sellerId: string;
let generationId: string;
const donorIds: string[] = [];

async function newDonor(scrapReason?: string | null) {
  const { id } = await createDonorVehicle(db, {
    sellerId,
    generationId,
    label: S(`car-${donorIds.length}`),
    ...(scrapReason !== undefined ? { scrapReason } : {}),
  });
  donorIds.push(id);
  return id;
}

const scrapReasonOf = async (id: string) =>
  (await db.donorVehicle.findUniqueOrThrow({ where: { id }, select: { scrapReason: true } })).scrapReason;

beforeAll(async () => {
  const make = await db.vehicleMake.create({ data: { name: S("Mk"), slug: S("mk") } });
  const mg = await db.vehicleModelGroup.create({ data: { name: S("Model"), slug: S("model"), makeId: make.id } });
  generationId = (await db.vehicleGeneration.create({ data: { label: S("Gen"), slug: S("gen"), modelGroupId: mg.id } })).id;
  sellerId = (await db.seller.create({ data: { displayName: S("Seller"), contactName: "S", contactEmail: `${TAG}@x.test`, locationCity: "Sofia" } })).id;
});

afterAll(async () => {
  await db.donorVehicle.deleteMany({ where: { id: { in: donorIds } } });
  await db.seller.deleteMany({ where: { id: sellerId } });
  await db.vehicleGeneration.deleteMany({ where: { slug: S("gen") } });
  await db.vehicleModelGroup.deleteMany({ where: { slug: S("model") } });
  await db.vehicleMake.deleteMany({ where: { slug: S("mk") } });
  await db.$disconnect();
});

describe("DonorVehicle scrapReason — the seller's own words on why the car was scrapped", () => {
  it("is stored trimmed when a donor vehicle is created", async () => {
    const id = await newDonor("  Flood damage in the 2023 storms  ");
    expect(await scrapReasonOf(id)).toBe("Flood damage in the 2023 storms");
  });

  it("is null when omitted or left blank", async () => {
    expect(await scrapReasonOf(await newDonor())).toBeNull();
    expect(await scrapReasonOf(await newDonor("   "))).toBeNull();
  });

  it("can be set on update, and a blank value clears it back to null", async () => {
    const id = await newDonor();

    await updateDonorVehicle(db, id, { scrapReason: "Front-end accident" });
    expect(await scrapReasonOf(id)).toBe("Front-end accident");

    await updateDonorVehicle(db, id, { scrapReason: "" });
    expect(await scrapReasonOf(id)).toBeNull();
  });

  it("is left alone when an update does not mention it", async () => {
    const id = await newDonor("End of life");
    await updateDonorVehicle(db, id, { notes: "checked by staff" });
    expect(await scrapReasonOf(id)).toBe("End of life");
  });
});

describe("DonorVehicle year and mileage — edited through the staff form", () => {
  const numbersOf = async (id: string) =>
    db.donorVehicle.findUniqueOrThrow({ where: { id }, select: { donorYear: true, mileageKm: true } });

  // The edit form always submits every field; a blanked input arrives as "".
  const submitEdit = (id: string, donorYear: string, mileageKm: string) =>
    updateDonorVehicle(
      db,
      id,
      donorVehicleSchema.parse({ sellerId, generationId, label: S("edit"), donorYear, mileageKm }),
    );

  it("saves the numbers typed into the form", async () => {
    const id = await newDonor();
    await submitEdit(id, "2011", "184000");
    expect(await numbersOf(id)).toEqual({ donorYear: 2011, mileageKm: 184000 });
  });

  it("clears both back to null when the fields are blanked", async () => {
    const id = await newDonor();
    await submitEdit(id, "2011", "184000");

    await submitEdit(id, "", "  ");
    expect(await numbersOf(id)).toEqual({ donorYear: null, mileageKm: null });
  });

  it("keeps a mileage of 0", async () => {
    const id = await newDonor();
    await submitEdit(id, "2011", "0");
    expect(await numbersOf(id)).toEqual({ donorYear: 2011, mileageKm: 0 });
  });
});
