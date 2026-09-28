import type { SourceFileType } from "@/types/models";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const BY_EXT: Record<string, SourceFileType> = {
  pptx: "pptx",
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
  md: "txt",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
};

export const ACCEPT_ATTR = ".pptx,.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";
export const SUPPORTED_LABEL = "PowerPoint, PDF, Word, TXT or images";

export type ValidationResult = { ok: true; type: SourceFileType } | { ok: false; error: string };

export function detectType(name: string): SourceFileType | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXT[ext] ?? null;
}

export function validateFile(file: File): ValidationResult {
  const type = detectType(file.name);
  if (!type) {
    if (/\.(ppt|doc)$/i.test(file.name))
      return { ok: false, error: "Older .ppt/.doc files aren't supported. Save as .pptx or .docx and try again." };
    return { ok: false, error: "Please upload a supported file type." };
  }
  if (file.size === 0) return { ok: false, error: "This file is empty." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "This file is larger than 25 MB." };
  return { ok: true, type };
}

export const FILE_TYPE_LABEL: Record<SourceFileType, string> = {
  pptx: "PowerPoint",
  pdf: "PDF",
  docx: "Word",
  txt: "Text",
  image: "Image",
  text: "Pasted text",
};
