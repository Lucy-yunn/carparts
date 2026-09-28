import { describe, it, expect } from "vitest";
import { drawForJpeg } from "./shrink-photo";

/** A stand-in 2D context that records what was painted, in order. */
function fakeContext() {
  const painted: string[] = [];
  const ctx = {
    fillStyle: "",
    fillRect: (x: number, y: number, w: number, h: number) => painted.push(`fill ${ctx.fillStyle} ${x},${y} ${w}x${h}`),
    drawImage: (_img: unknown, x: number, y: number, w: number, h: number) => painted.push(`image ${x},${y} ${w}x${h}`),
  };
  return { ctx, painted };
}

describe("drawForJpeg — a transparent PNG (e.g. a seller logo) must not turn black as JPEG", () => {
  it("paints the whole canvas white, then the photo on top", () => {
    const { ctx, painted } = fakeContext();
    drawForJpeg(ctx, {} as CanvasImageSource, 2000, 1500);
    expect(painted).toEqual(["fill #ffffff 0,0 2000x1500", "image 0,0 2000x1500"]);
  });
});
