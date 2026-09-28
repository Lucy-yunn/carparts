"use client";

import Image from "next/image";
import { useActionState } from "react";
import { SubmitButton, FormMessage } from "../../_components/form";
import type { AuthFormState } from "../../register/actions";
import { uploadSellerAvatarAction, removeSellerAvatarAction } from "./avatar-actions";
import { shrinkPhoto } from "../_lib/shrink-photo";
import { shrinkThenUpload } from "../_lib/shrink-then-upload";

/**
 * The seller's public avatar (docs/seller-profile.md §2). Optional: with none, the
 * public profile shows the first letter of the seller's name.
 */
export function AvatarPanel({
  sellerId,
  displayName,
  avatarUrl,
}: {
  sellerId: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    shrinkThenUpload(uploadSellerAvatarAction, shrinkPhoto),
    undefined,
  );

  return (
    <div className="flex flex-wrap items-center gap-4">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={`${displayName} avatar`}
          width={80}
          height={80}
          unoptimized
          className="h-20 w-20 rounded-full border border-zinc-200 object-cover dark:border-zinc-800"
        />
      ) : (
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-purple-100 text-2xl font-semibold text-purple-800">
          {displayName.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}

      <div className="flex flex-col gap-2">
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="sellerId" value={sellerId} />
          <input type="file" name="photo" accept="image/*" className="text-sm" />
          <SubmitButton pending={pending}>{avatarUrl ? "Replace" : "Upload"}</SubmitButton>
        </form>
        {avatarUrl ? (
          <form action={removeSellerAvatarAction}>
            <input type="hidden" name="sellerId" value={sellerId} />
            <button className="text-sm underline">Remove avatar</button>
          </form>
        ) : null}
        <FormMessage message={state?.message} />
      </div>
    </div>
  );
}
