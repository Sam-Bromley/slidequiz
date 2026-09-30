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
  // Pro: lecture recordings (transcribed, see services/media.ts)
  mp3: "audio",
  m4a: "audio",
  wav: "audio",
  aac: "audio",
  ogg: "audio",
  oga: "audio",
  opus: "audio",
  flac: "audio",
  weba: "audio",
  mp4: "video",
  mov: "video",
  m4v: "video",
  webm: "video",
};
const MEDIA_MAX_BYTES = 500 * 1024 * 1024;

export const ACCEPT_ATTR = ".pptx,.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.aac,.ogg,.oga,.opus,.flac,.weba,.mp4,.mov,.m4v,.webm";
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
  if (type === "audio" || type === "video") {
    if (file.size > MEDIA_MAX_BYTES) return { ok: false, error: "This recording is larger than 500 MB." };
    return { ok: true, type };
  }
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
  audio: "Recording",
  video: "Video",
  youtube: "YouTube video",
};
