/**
 * Slide images live in IndexedDB (browser storage with room for hundreds of MB),
 * not in the main JSON save, which is limited to a few MB.
 * Falls back to memory when IndexedDB is unavailable (e.g. some private windows).
 */

const DB_NAME = "slidequiz-images";
const STORE = "images";
const memory = new Map<string, Blob>();
/** Images parsed but not yet saved (kept until the student saves the upload). */
export const pendingImages = new Map<string, Blob>();
const urls = new Map<string, string>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const t = db.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          t.oncomplete = () => resolve(req ? req.result : undefined);
          t.onerror = () => resolve(undefined);
          t.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export const imageStore = {
  async put(id: string, blob: Blob) {
    memory.set(id, blob);
    await tx("readwrite", (s) => s.put(blob, id));
  },
  async get(id: string): Promise<Blob | null> {
    if (pendingImages.has(id)) return pendingImages.get(id)!;
    if (memory.has(id)) return memory.get(id)!;
    const b = (await tx<Blob>("readonly", (s) => s.get(id))) ?? null;
    if (b) memory.set(id, b);
    return b;
  },
  /** An object URL for <img src>, cached per image. */
  async url(id: string): Promise<string | null> {
    if (urls.has(id)) return urls.get(id)!;
    const b = await this.get(id);
    if (!b) return null;
    const u = URL.createObjectURL(b);
    urls.set(id, u);
    return u;
  },
  async remove(ids: string[]) {
    for (const id of ids) {
      memory.delete(id);
      const u = urls.get(id);
      if (u) URL.revokeObjectURL(u);
      urls.delete(id);
    }
    await tx("readwrite", (s) => {
      ids.forEach((id) => s.delete(id));
    });
  },
};

/** Saves the upload's pictures in one go (they stay readable from memory while this runs). */
export async function persistPendingImages(ids: string[]) {
  const todo = ids.map((id) => [id, pendingImages.get(id)] as const).filter((x): x is readonly [string, Blob] => !!x[1]);
  if (!todo.length) return;
  for (const [id, b] of todo) memory.set(id, b);
  await tx("readwrite", (s) => {
    for (const [id, b] of todo) s.put(b, id);
  });
  for (const [id] of todo) pendingImages.delete(id);
}
