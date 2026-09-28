import { describe, it, expect } from "vitest";
import { checkPhotoFile, fitWithin, PHOTO_UPLOAD_MAX_BYTES } from "./photo-upload-limits";

const MB = 1024 * 1024;

describe("checkPhotoFile — what may be sent to the upload action", () => {
  it("accepts an image under the limit", () => {
    expect(checkPhotoFile({ size: 900 * 1024, type: "image/jpeg" })).toBeNull();
  });

  it("asks for a photo when nothing was chosen", () => {
    expect(checkPhotoFile(null)).toBe("Choose a photo");
    expect(checkPhotoFile({ size: 0, type: "image/jpeg" })).toBe("Choose a photo");
  });

  it("refuses a file that is not an image", () => {
    expect(checkPhotoFile({ size: 1000, type: "application/pdf" })).toBe("That file isn't an image");
  });

  it("refuses anything over 4 MB with a clear message", () => {
    expect(PHOTO_UPLOAD_MAX_BYTES).toBe(4 * MB);
    expect(checkPhotoFile({ size: 4 * MB + 1, type: "image/jpeg" })).toBe(
      "Photo is over 4 MB even after shrinking. Try a smaller photo or save it as JPEG.",
    );
    expect(checkPhotoFile({ size: 4 * MB, type: "image/jpeg" })).toBeNull();
  });
});

describe("fitWithin — shrinking a photo in the browser before upload", () => {
  it("scales a landscape phone photo so its long edge is 2000px", () => {
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 });
  });

  it("scales a portrait photo by its height", () => {
    expect(fitWithin(3024, 4032, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it("never enlarges a photo that is already small", () => {
    expect(fitWithin(1200, 800, 2000)).toEqual({ width: 1200, height: 800 });
  });
});
