/**
 * Pro members can use their own photo as the background. The photo is shrunk (so it loads
 * quickly) and kept on this device with the slide pictures (IndexedDB), not in the account.
 */
import { useEffect, useState } from "react";
import { imageStore } from "@/services/storage/images";
import { actions } from "@/store/actions";
import { getState } from "@/store/store";

const MAX_SIDE = 2400;
const MAX_FILE = 25 * 1024 * 1024;

async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that picture."))), "image/jpeg", 0.86));
}

/** Saves a new background photo and switches to it. Throws a readable message on failure. */
export async function setBackgroundPhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a picture (JPG, PNG or similar).");
  if (file.size > MAX_FILE) throw new Error("That picture is too big. Choose one under 25 MB.");
  let blob: Blob;
  try {
    blob = await shrink(file);
  } catch {
    throw new Error("Couldn't read that picture. Try a JPG or PNG.");
  }
  const old = getState().settings.bgPhoto;
  const id = `bgphoto-${Date.now().toString(36)}`;
  await imageStore.put(id, blob);
  actions.updateSettings({ bgPhoto: id, bgPhotoOn: true });
  if (old) imageStore.remove([old]);
}

export function removeBackgroundPhoto() {
  const old = getState().settings.bgPhoto;
  actions.updateSettings({ bgPhoto: undefined, bgPhotoOn: false });
  if (old) imageStore.remove([old]);
}

/** A URL for the saved photo, or null (none saved, or it's on another device). */
export function useBackgroundPhotoUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!id) setUrl(null);
    else imageStore.url(id).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [id]);
  return url;
}
