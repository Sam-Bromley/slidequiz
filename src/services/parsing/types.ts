import type { SourceFileType } from "@/types/models";

export interface ParsedImage {
  /** Same key = same picture (used to spot logos repeated on every slide). */
  key: string;
  blob: Blob;
  width: number;
  height: number;
  /** Has enough detail to be a real picture/diagram (not a plain block of colour or a gradient). */
  detailed?: boolean;
  /** Worth showing in the notes by default (decided per slide, from size and placement). */
  useful?: boolean;
}

export interface ParsedPage {
  title: string;
  text: string;
  imageDataUrl?: string;
  needsText?: boolean;
  images?: ParsedImage[];
}

export interface ParsedDocument {
  fileType: SourceFileType;
  title: string;
  unit: "slides" | "pages" | "sections";
  pages: ParsedPage[];
  warnings: string[];
}

export type ProgressFn = (fraction: number, label?: string) => void;

/** Every format parser implements this. Swap any of them for a server-side parser later. */
export interface DocumentParser {
  type: SourceFileType;
  parse(file: File, onProgress: ProgressFn): Promise<ParsedDocument>;
}

export class ParseError extends Error {
  constructor(message: string, public readonly userMessage: string) {
    super(message);
  }
}
