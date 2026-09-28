/** Folder helpers: what's inside a folder (including sub-folders), exam countdowns and coverage. */
import type { AppData } from "@/services/db/types";
import { isCovered, practiceSet } from "@/services/practice";
import type { ID, Material } from "@/types/models";

export function materialsIn(d: AppData, folderId: ID): Material[] {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of d.folders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) (ids.add(f.id), (grew = true));
  }
  return d.materials.filter((m) => m.folderId && ids.has(m.folderId));
}

/** Whole days from today until the date ("YYYY-MM-DD"), or null. */
export function daysUntil(date?: string): number | null {
  if (!date) return null;
  const [y, mo, da] = date.split("-").map(Number);
  if (!y || !mo || !da) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, mo - 1, da).getTime() - today.getTime()) / 86400000);
}

export function examLabel(date?: string): string | null {
  const n = daysUntil(date);
  if (n === null) return null;
  if (n < 0) return "Exam passed";
  if (n === 0) return "Exam today";
  if (n === 1) return "Exam tomorrow";
  return `Exam in ${n} days`;
}

export function folderCoverage(d: AppData, folderId: ID) {
  const qs = materialsIn(d, folderId).flatMap((m) => practiceSet(d, m.id));
  const covered = qs.filter(isCovered).length;
  return { total: qs.length, covered, pct: qs.length ? Math.round((covered / qs.length) * 100) : 0 };
}
