import { describe, it, expect } from "vitest";
import { shrinkThenUpload } from "./shrink-then-upload";

const MB = 1024 * 1024;
type State = { message?: string } | undefined;
const photo = (bytes: number, name = "car.heic", type = "image/heic") =>
  new File([new Uint8Array(bytes)], name, { type });

function setup(shrinkTo: File | ((f: File) => File)) {
  const sent: FormData[] = [];
  const upload = async (_prev: State, fd: FormData): Promise<State> => {
    sent.push(fd);
    return { message: "Uploaded" };
  };
  const shrink = async (f: File) => (typeof shrinkTo === "function" ? shrinkTo(f) : shrinkTo);
  return { sent, action: shrinkThenUpload(upload, shrink) };
}

const form = (file?: File) => {
  const fd = new FormData();
  fd.set("sellerId", "s1");
  if (file) fd.set("photo", file);
  return fd;
};

describe("shrinkThenUpload — every admin photo form shrinks, then checks, then sends", () => {
  it("sends the shrunk photo in place of the chosen one, keeping the other fields", async () => {
    const small = photo(700 * 1024, "car.jpg", "image/jpeg");
    const { sent, action } = setup(small);
    expect(await action(undefined, form(photo(9 * MB)))).toEqual({ message: "Uploaded" });
    expect(sent).toHaveLength(1);
    expect(sent[0].get("photo")).toBe(small);
    expect(sent[0].get("sellerId")).toBe("s1");
  });

  it("sends nothing and explains when the photo is still over 4 MB after shrinking", async () => {
    const { sent, action } = setup((f) => f); // the browser could not shrink it
    expect(await action(undefined, form(photo(9 * MB)))).toEqual({
      message: "Photo is over 4 MB even after shrinking. Try a smaller photo or save it as JPEG.",
    });
    expect(sent).toHaveLength(0);
  });

  it("sends nothing when no photo was chosen", async () => {
    const { sent, action } = setup((f) => f);
    expect(await action(undefined, form())).toEqual({ message: "Choose a photo" });
    expect(sent).toHaveLength(0);
  });
});
