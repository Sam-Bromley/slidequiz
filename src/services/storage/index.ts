/**
 * File storage seam. Parsed text is what the app studies from, so the original binaries are
 * kept only for this session. Swap for S3/GCS/Supabase Storage to keep originals.
 */
export interface FileStorage {
  put(key: string, file: Blob): Promise<string>;
  get(key: string): Promise<Blob | null>;
  remove(key: string): Promise<void>;
}

class SessionFileStorage implements FileStorage {
  private files = new Map<string, Blob>();
  async put(key: string, file: Blob) {
    this.files.set(key, file);
    return key;
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async remove(key: string) {
    this.files.delete(key);
  }
}

export const fileStorage: FileStorage = new SessionFileStorage();
