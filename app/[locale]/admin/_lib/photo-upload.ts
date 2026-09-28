import "server-only";
import { InvariantError, NotFoundError } from "@/lib/dal";
import { checkPhotoFile } from "@/lib/photo-upload-limits";

/** Shared validation + error mapping for the admin photo-upload actions. */

export async function readPhoto(
  formData: FormData,
): Promise<Buffer | { error: string }> {
  const file = formData.get("photo");
  const error = checkPhotoFile(file instanceof File ? file : null);
  if (error) return { error };
  return Buffer.from(await (file as File).arrayBuffer());
}

export function photoErrorMessage(err: unknown): string {
  if (err instanceof InvariantError || err instanceof NotFoundError) return err.message;
  const message = String((err as { message?: string })?.message ?? "");
  if (message.toLowerCase().includes("token")) {
    return "Photo storage isn't configured in this environment.";
  }
  return `Upload failed (${(err as { name?: string })?.name ?? "Error"})`;
}
