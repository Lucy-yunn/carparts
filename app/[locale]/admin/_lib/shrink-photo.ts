import { fitWithin, PHOTO_MAX_EDGE } from "@/lib/photo-upload-limits";

/**
 * Browser only. Shrinks a chosen photo to PHOTO_MAX_EDGE and re-encodes it as JPEG before it is
 * sent, so a 2–12 MB phone photo fits the upload limit (issue #37). The server still runs the
 * final sharp downscale. If the browser can't decode the file (e.g. HEIC in Chrome), the
 * original is returned and the size check decides.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  const { width, height } = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob || blob.size >= file.size) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
