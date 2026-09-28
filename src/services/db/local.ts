import type { AppData, Database } from "./types";

const KEY = "slidequiz:data";

export class LocalDatabase implements Database {
  private memory: AppData | null = null;

  load(): AppData | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as AppData;
    } catch {
      /* private mode or corrupted data — fall back to memory */
    }
    return this.memory;
  }

  save(data: AppData) {
    this.memory = data;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return { ok: true as const };
    } catch (e) {
      const quota = e instanceof DOMException && /quota/i.test(e.name + e.message);
      return { ok: false as const, error: quota ? "Your browser storage is full. Delete some materials to keep saving progress." : "Progress couldn't be saved in this browser." };
    }
  }

  clear() {
    this.memory = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}

export const db: Database = new LocalDatabase();
