import { checkPhotoFile } from "../../../../lib/photo-upload-limits";

type UploadAction<S> = (prev: S, formData: FormData) => Promise<S>;

/**
 * Wraps an admin photo-upload Server Action for `useActionState`: shrink the chosen photo in
 * the browser, check it, and only then send it. An oversized photo gets a clear message here
 * instead of being cut off at the request-size limit (issue #37). Used by every admin form
 * that uploads a photo (PhotoManager, the seller avatar).
 */
export function shrinkThenUpload<S>(
  upload: UploadAction<S>,
  shrink: (file: File) => Promise<File>,
): UploadAction<S | { message: string }> {
  return async (prev, formData) => {
    const chosen = formData.get("photo");
    const photo = chosen instanceof File && chosen.size > 0 ? await shrink(chosen) : null;
    const error = checkPhotoFile(photo);
    if (error) return { message: error };
    formData.set("photo", photo as File);
    return upload(prev as S, formData);
  };
}
