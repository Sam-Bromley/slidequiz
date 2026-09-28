/**
 * Back up everything (materials, notes, questions, flashcards, progress and slide images)
 * into one file, and restore it on any device or browser.
 */
import { imageStore } from "@/services/storage/images";
import { emptyData, SCHEMA_VERSION } from "@/store/defaults";
import { getState, replaceState } from "@/store/store";
import type { AppData } from "@/services/db/types";

interface BackupFile {
  app: "slidequiz";
  version: number;
  savedAt: string;
  data: AppData;
  images: Record<string, string>;
}

const toDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

export async function makeBackup(): Promise<Blob> {
  const data = getState();
  const images: Record<string, string> = {};
  for (const m of data.materials)
    for (const p of m.pages)
      for (const img of p.images ?? []) {
        const b = await imageStore.get(img.id);
        if (b) images[img.id] = await toDataUrl(b);
      }
  const file: BackupFile = { app: "slidequiz", version: SCHEMA_VERSION, savedAt: new Date().toISOString(), data, images };
  return new Blob([JSON.stringify(file)], { type: "application/json" });
}

export function backupName(d = new Date()) {
  return `slidequiz-backup-${d.toISOString().slice(0, 10)}.json`;
}

/** Replaces everything with the backup. Throws a readable message if the file isn't a backup. */
export async function restoreBackup(file: File): Promise<{ materials: number }> {
  let parsed: Partial<BackupFile>;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a SlideQuiz backup.");
  }
  const d = parsed?.data as AppData | undefined;
  if (parsed?.app !== "slidequiz" || !d || !Array.isArray(d.materials)) throw new Error("That file isn't a SlideQuiz backup.");
  if ((d.schemaVersion ?? 0) > SCHEMA_VERSION) throw new Error("This backup is from a newer version of SlideQuiz. Refresh the page and try again.");
  for (const [id, url] of Object.entries(parsed.images ?? {})) {
    const blob = await (await fetch(url)).blob();
    await imageStore.put(id, blob);
  }
  const base = emptyData();
  replaceState({ ...base, ...d, schemaVersion: SCHEMA_VERSION, settings: { ...base.settings, ...d.settings }, folders: d.folders ?? [], decks: d.decks ?? [] });
  return { materials: d.materials.length };
}
