/** Passes files or pasted text picked on Home to the upload screen. */
let pending: { files: File[]; text: string } | null = null;

export function handOffUpload(files: File[], text = "") {
  pending = { files, text };
}

export function takeUpload() {
  const p = pending;
  pending = null;
  return p;
}
