/**
 * Pro members can use their own photo as the background. It's kept as sharp as the screen can show
 * (only very large photos are scaled down), and kept on this device with the slide pictures (IndexedDB), not in the account.
 */
import { useEffect, useState } from "react";
import { imageStore } from "@/services/storage/images";
import { actions } from "@/store/actions";
import { getState } from "@/store/store";

const MAX_FILE = 40 * 1024 * 1024;

/**
 * How many real pixels this screen has along its longest side (a MacBook or phone packs 2–3 pixels
 * into each "point"). The photo is kept at least this big so it's pin-sharp; never more than 5K.
 */
function screenPixels() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const side = Math.max(window.screen?.width ?? 1920, window.screen?.height ?? 1080) * dpr;
  return Math.round(Math.min(5120, Math.max(2560, side)));
}

/** Keeps the original if it's already a sensible size; otherwise scales it down carefully (no blur). */
async function prepare(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const target = screenPixels();
  const longest = Math.max(bmp.width, bmp.height);
  const webFriendly = /^image\/(jpeg|png|webp|avif)$/.test(file.type);
  if (longest <= target && webFriendly && file.size <= 15 * 1024 * 1024) {
    bmp.close?.();
    return file; // already the right size: use it exactly as it is
  }
  const scale = Math.min(1, target / longest);
  let w = bmp.width;
  let h = bmp.height;
  let src: CanvasImageSource = bmp;
  const targetW = Math.round(bmp.width * scale);
  // Halve in steps first: one big jump makes fine detail look grainy.
  while (w / 2 >= targetW) {
    const c = document.createElement("canvas");
    c.width = Math.round(w / 2);
    c.height = Math.round(h / 2);
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(src, 0, 0, c.width, c.height);
    src = c;
    w = c.width;
    h = c.height;
  }
  const out = document.createElement("canvas");
  out.width = Math.round(bmp.width * scale);
  out.height = Math.round(bmp.height * scale);
  const g = out.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, out.width, out.height);
  bmp.close?.();
  return await new Promise<Blob>((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that picture."))), "image/jpeg", 0.93));
}

/** Saves a new background photo and switches to it. Throws a readable message on failure. */
export async function setBackgroundPhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a picture (JPG, PNG or similar).");
  if (file.size > MAX_FILE) throw new Error("That picture is too big. Choose one under 40 MB.");
  let blob: Blob;
  try {
    blob = await prepare(file);
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
