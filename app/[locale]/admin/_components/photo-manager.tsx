"use client";

import Image from "next/image";
import { useActionState } from "react";
import { SubmitButton, FormMessage } from "../../_components/form";
import { shrinkPhoto } from "../_lib/shrink-photo";
import { shrinkThenUpload } from "../_lib/shrink-then-upload";
import type { AuthFormState } from "../../register/actions";

export interface PhotoRow {
  id: string;
  url: string;
  caption: string | null;
}

/**
 * Generic photo manager for a Listing or a DonorVehicle. The parent wires the
 * three actions; the first photo (order 0) is the primary.
 */
export function PhotoManager({
  ownerField,
  ownerId,
  photos,
  uploadAction,
  removeAction,
  moveAction,
}: {
  ownerField: string; // "listingId" | "donorVehicleId"
  ownerId: string;
  photos: PhotoRow[];
  uploadAction: (
    prev: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  removeAction: (formData: FormData) => void | Promise<void>;
  moveAction?: (formData: FormData) => void | Promise<void>;
}) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    shrinkThenUpload(uploadAction, shrinkPhoto),
    undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {photos.map((p, i) => (
          <figure key={p.id} className="w-32">
            <Image
              src={p.url}
              alt={p.caption ?? ""}
              width={128}
              height={96}
              className="h-24 w-32 rounded border border-zinc-200 object-cover dark:border-zinc-800"
              unoptimized
            />
            <figcaption className="mt-1 flex items-center gap-1 text-xs">
              {i === 0 ? <span className="font-medium">primary</span> : null}
              {moveAction && i > 0 ? (
                <MoveButton id={p.id} direction="up" action={moveAction} label="↑" />
              ) : null}
              {moveAction && i < photos.length - 1 ? (
                <MoveButton id={p.id} direction="down" action={moveAction} label="↓" />
              ) : null}
              <form action={removeAction}>
                <input type="hidden" name="id" value={p.id} />
                <button className="underline">remove</button>
              </form>
            </figcaption>
          </figure>
        ))}
        {photos.length === 0 ? (
          <p className="text-sm text-zinc-500">No photos yet.</p>
        ) : null}
      </div>

      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name={ownerField} value={ownerId} />
        <input
          type="file"
          name="photo"
          accept="image/*"
          className="text-sm"
        />
        <SubmitButton pending={pending}>Upload</SubmitButton>
      </form>
      <FormMessage message={state?.message} />
    </div>
  );
}

function MoveButton({
  id,
  direction,
  action,
  label,
}: {
  id: string;
  direction: "up" | "down";
  action: (formData: FormData) => void | Promise<void>;
  label: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <button className="underline">{label}</button>
    </form>
  );
}
