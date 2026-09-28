/**
 * Node-safe (NO `server-only`): shared by the admin photo form in the browser and the upload
 * Server Action. Issue #37: a hosted function accepts at most 4.5 MB per request, so the
 * browser shrinks a photo before sending it and nothing over 4 MB is ever sent.
 */

export const PHOTO_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/** Longest edge of a stored photo; the browser shrinks to it and lib/images.ts enforces it. */
export const PHOTO_MAX_EDGE = 2000;

/** The error message for a chosen file, or null when it may be uploaded. */
export function checkPhotoFile(file: { size: number; type: string } | null): string | null {
  if (!file || file.size === 0) return "Choose a photo";
  if (!file.type.startsWith("image/")) return "That file isn't an image";
  if (file.size > PHOTO_UPLOAD_MAX_BYTES) {
    return "Photo is over 4 MB even after shrinking. Try a smaller photo or save it as JPEG.";
  }
  return null;
}

/** Size that fits inside maxEdge × maxEdge, keeping the aspect ratio. Never enlarges. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
