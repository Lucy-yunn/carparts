import { describe, it, expect } from "vitest";
import { generationSchema } from "./admin";

// What the "add generation" form submits; its year inputs arrive as strings.
const form = (productionStart: string, productionEnd: string) => ({
  label: "E90",
  modelGroupId: "mg1",
  productionStart,
  productionEnd,
});

describe("generationSchema — production years", () => {
  it("accepts blank years and never turns them into 0", () => {
    const r = generationSchema.safeParse(form("", "  "));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.productionStart ?? null).toBeNull();
      expect(r.data.productionEnd ?? null).toBeNull();
    }
  });

  it("keeps a still-in-production generation: start year, no end year", () => {
    const r = generationSchema.safeParse(form("2005", ""));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.productionStart).toBe(2005);
      expect(r.data.productionEnd ?? null).toBeNull();
    }
  });

  it("still rejects a year outside 1950–2100", () => {
    expect(generationSchema.safeParse(form("1900", "")).success).toBe(false);
  });
});
