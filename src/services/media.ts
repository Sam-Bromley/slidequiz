/**
 * Pro: lecture recordings (audio or video files) and YouTube videos.
 *
 * Audio: the browser pulls the sound out of the file, turns it into small 16 kHz mono pieces
 * (5 minutes each) and sends them one by one to the "media" helper in Supabase, which has them
 * transcribed (Groq Whisper). The transcript then becomes a normal material, so the AI writes
 * the notes and questions from it as usual (and it uses credits by the amount of text).
 *
 * YouTube: the helper reads the video's captions. Not every video has them, and YouTube can
 * refuse, so there's always the fallback of pasting the transcript.
 */
import { authToken, isLoggedIn, SUPABASE_KEY, SUPABASE_URL } from "@/services/account";
import { ParseError, type ParsedDocument, type ProgressFn } from "@/services/parsing/types";
import { parsePlainText } from "@/services/parsing/parsers";

const MEDIA_ENDPOINT = `${SUPABASE_URL}/functions/v1/media`;
const RATE = 16000;
const PIECE_SECONDS = 300;
export const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
const MAX_SECONDS = 4 * 3600;

const AUDIO_EXT = ["mp3", "m4a", "wav", "aac", "ogg", "oga", "opus", "flac", "weba"];
const VIDEO_EXT = ["mp4", "mov", "m4v", "webm"];
export const MEDIA_ACCEPT = [...AUDIO_EXT, ...VIDEO_EXT].map((e) => "." + e).join(",");

export function mediaKind(name: string): "audio" | "video" | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXT.includes(ext) ? "audio" : VIDEO_EXT.includes(ext) ? "video" : null;
}

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

async function token(): Promise<string> {
  if (!isLoggedIn()) throw new ParseError("login", "Log in with your Pro account to add recordings and YouTube videos.");
  const t = await authToken();
  if (!t) throw new ParseError("login", "You've been logged out. Log in again.");
  return t;
}

async function send(body: BodyInit, query: string, contentType: string): Promise<any> {
  const t = await token();
  let res: Response;
  try {
    res = await fetch(`${MEDIA_ENDPOINT}?${query}`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${t}`, "Content-Type": contentType }, body });
  } catch {
    throw new ParseError("network", "Couldn't reach the server. Check your internet connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (res.status === 404) throw new ParseError("off", "Recordings and YouTube videos aren't switched on yet.");
  if (!res.ok) throw new ParseError("media", data?.error ?? "Something went wrong. Try again in a minute.");
  return data;
}

/** 16-bit mono WAV for one piece of audio. */
function wav(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** The sound from an audio or video file, as 16 kHz mono. */
async function decode(file: File): Promise<Float32Array> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ sampleRate: RATE });
  try {
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    if (audio.numberOfChannels === 1) return audio.getChannelData(0);
    const out = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c);
      for (let i = 0; i < ch.length; i++) out[i] += ch[i] / audio.numberOfChannels;
    }
    return out;
  } catch {
    throw new ParseError("decode", "Couldn't read the sound in this file. Try an MP3, M4A or MP4, or a shorter recording.");
  } finally {
    ctx.close().catch(() => {});
  }
}

/** Splits a long stretch of speech into sections of about 400 words, each headed with a rough time. */
function sections(text: string, start: number, length: number): string[] {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const blocks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > 2400) {
      blocks.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) blocks.push(cur.trim());
  return blocks.map((b, k) => `# ${clock(start + (length * k) / blocks.length)}\n${b}`);
}

const baseName = (n: string) => n.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "Recording";

/** Turns a lecture recording into a document the rest of SlideQuiz can use. */
export async function transcribeFile(file: File, onProgress: ProgressFn): Promise<ParsedDocument> {
  if (file.size > MAX_MEDIA_BYTES) throw new ParseError("big", "This recording is larger than 500 MB. Try a shorter one, or an audio-only version.");
  await token();
  onProgress(0.03, "Getting the sound ready…");
  const samples = await decode(file);
  const seconds = samples.length / RATE;
  if (seconds < 5) throw new ParseError("short", "This recording is too short to make notes from.");
  if (seconds > MAX_SECONDS) throw new ParseError("long", "This recording is longer than 4 hours. Split it into shorter parts.");
  const per = PIECE_SECONDS * RATE;
  const pieces = Math.ceil(samples.length / per);
  const parts: string[] = [];
  for (let i = 0; i < pieces; i++) {
    onProgress(0.08 + (0.9 * i) / pieces, pieces > 1 ? `Listening to part ${i + 1} of ${pieces}…` : "Listening…");
    const slice = samples.subarray(i * per, Math.min(samples.length, (i + 1) * per));
    const r = await send(wav(slice), `task=transcribe&seconds=${Math.ceil(slice.length / RATE)}`, "audio/wav");
    const text = String(r?.text ?? "").trim();
    if (text) parts.push(...sections(text, i * PIECE_SECONDS, slice.length / RATE));
  }
  onProgress(1);
  if (!parts.length) throw new ParseError("silent", "We couldn't hear any speech in this recording.");
  const doc = parsePlainText(parts.join("\n\n"), baseName(file.name));
  return { ...doc, fileType: mediaKind(file.name) === "video" ? "video" : "audio" };
}

/** A YouTube link's captions as a document. Throws a ParseError with a friendly message. */
export async function youtubeDocument(url: string): Promise<ParsedDocument> {
  const id = url.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/)?.[1];
  if (!id) throw new ParseError("url", "That doesn't look like a YouTube link.");
  const r = await send(JSON.stringify({ id }), "task=youtube", "application/json");
  const text = String(r?.text ?? "").trim();
  if (!text) throw new ParseError("captions", "This video has no captions we can read.");
  const secs = Number(r?.seconds) || 0;
  const blocks = sections(text, 0, secs).map((b, k) => (secs ? b : b.replace(/^# [^\n]*/, `# Part ${k + 1}`)));
  const doc = parsePlainText(blocks.join("\n\n"), String(r?.title ?? "YouTube video").trim() || "YouTube video");
  return { ...doc, fileType: "youtube" };
}
