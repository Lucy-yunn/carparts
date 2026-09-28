import sharp from "sharp";
import { PHOTO_MAX_EDGE } from "./photo-upload-limits";

/**
 * Node-safe. Downscale a staff-uploaded photo for the web on ingest
 * (docs/spec/admin-tool.md §6.2.3): longest edge ~2000px, re-encoded to JPEG,
 * EXIF orientation applied and metadata stripped. Only the result reaches
 * Vercel Blob — the raw upload is never stored.
 */
export const MAX_EDGE = PHOTO_MAX_EDGE;

export interface ProcessedImage {
  data: Buffer;
  contentType: "image/jpeg";
  width: number;
  height: number;
}

export async function downscaleForWeb(input: Buffer): Promise<ProcessedImage> {
  const pipeline = sharp(input, { failOn: "error" })
    .rotate() // honour EXIF orientation, then drop metadata
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, mozjpeg: true });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    data,
    contentType: "image/jpeg",
    width: info.width,
    height: info.height,
  };
}
