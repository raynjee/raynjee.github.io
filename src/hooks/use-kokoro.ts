// use-kokoro.ts — Singleton manager for Kokoro TTS (client-side neural voice).
//
// The model (~86MB quantized) is downloaded once and cached in IndexedDB
// by the Hugging Face transformers.js runtime. Subsequent loads are instant.
// Runs 100% in the browser via ONNX Runtime Web (WASM / WebGPU).

import { useCallback, useEffect, useRef, useState } from "react";

/* ── Types ─────────────────────────────────────────────────────────── */

export type KokoroStatus = "idle" | "downloading" | "ready" | "error";

export interface KokoroVoice {
  id: string;       // e.g. "af_heart"
  name: string;     // e.g. "Heart (Female, American)"
  lang: string;     // e.g. "en-US"
  gender: "F" | "M";
}

export interface KokoroGenerateResult {
  data: Float32Array;
  sampleRate: number;
}

/** Fake SpeechSynthesisVoice-compatible object for Kokoro voices. */
export interface SyntheticVoice {
  name: string;
  lang: string;
  voiceURI: string; // "kokoro:af_heart"
  localService: boolean;
  default: boolean;
}

// ── Built-in voice catalog (English-only, curated subset) ────────────
// These are the highest-quality English voices from Kokoro-82M.
export const KOKORO_VOICES: KokoroVoice[] = [
  { id: "af_heart",    name: "Heart (F, American)",     lang: "en-US", gender: "F" },
  { id: "af_bella",    name: "Bella (F, American)",     lang: "en-US", gender: "F" },
  { id: "af_nicole",   name: "Nicole (F, American)",    lang: "en-US", gender: "F" },
  { id: "af_sarah",    name: "Sarah (F, American)",     lang: "en-US", gender: "F" },
  { id: "af_sky",      name: "Sky (F, American)",       lang: "en-US", gender: "F" },
  { id: "am_adam",     name: "Adam (M, American)",      lang: "en-US", gender: "M" },
  { id: "am_michael",  name: "Michael (M, American)",   lang: "en-US", gender: "M" },
  { id: "bf_emma",     name: "Emma (F, British)",       lang: "en-GB", gender: "F" },
  { id: "bf_isabella", name: "Isabella (F, British)",   lang: "en-GB", gender: "F" },
  { id: "bm_george",   name: "George (M, British)",     lang: "en-GB", gender: "M" },
  { id: "bm_lewis",    name: "Lewis (M, British)",      lang: "en-GB", gender: "M" },
];

/** Convert KokoroVoice[] to fake SpeechSynthesisVoice-compatible objects. */
export function toSyntheticVoices(): SyntheticVoice[] {
  return KOKORO_VOICES.map((v) => ({
    name: `Kokoro: ${v.name}`,
    lang: v.lang,
    voiceURI: `kokoro:${v.id}`,
    localService: true,
    default: false,
  }));
}

/** Check if a voice name/URI belongs to Kokoro. */
export function isKokoroVoice(voiceURI: string): boolean {
  return voiceURI.startsWith("kokoro:");
}

/** Extract the Kokoro voice ID from a voiceURI. */
export function kokoroVoiceId(voiceURI: string): string {
  return voiceURI.replace("kokoro:", "");
}

/* ── Singleton ─────────────────────────────────────────────────────── */

// The KokoroTTS instance lives outside React so it survives unmounts.
let kokoroInstance: any = null;
let kokoroPromise: Promise<any> | null = null;

type Listener = (status: KokoroStatus) => void;
const listeners = new Set<Listener>();
let _status: KokoroStatus = "idle";
let _error: string | null = null;

function notify() {
  for (const l of listeners) l(_status);
}

function setStatus(s: KokoroStatus) {
  _status = s;
  notify();
}

/** Load the Kokoro model. Idempotent — calling twice returns the same promise. */
export async function loadKokoro(): Promise<void> {
  if (kokoroInstance) return;
  if (kokoroPromise) {
    await kokoroPromise;
    return;
  }

  setStatus("downloading");
  kokoroPromise = (async () => {
    try {
      // Dynamic import so the ~86MB ONNX runtime is only loaded when needed.
      const { KokoroTTS } = await import("kokoro-js");
      kokoroInstance = await KokoroTTS.from_pretrained(
        "hexgrad/Kokoro-82M-v1.0-ONNX",
        { dtype: "q8" },
      );
      setStatus("ready");
    } catch (err) {
      _error = err instanceof Error ? err.message : String(err);
      console.error("Kokoro TTS load failed:", _error);
      setStatus("error");
      kokoroPromise = null;
      kokoroInstance = null;
    }
  })();

  await kokoroPromise;
}

/** Generate speech audio from text using the loaded Kokoro model. */
export async function generateSpeech(
  text: string,
  voiceId: string,
  speed: number = 1,
): Promise<KokoroGenerateResult> {
  if (!kokoroInstance) {
    throw new Error("Kokoro TTS is not loaded. Call loadKokoro() first.");
  }
  const result = await kokoroInstance.generate(text, {
    voice: voiceId,
    speed,
  });
  // kokoro-js returns { data: Float32Array, sampleRate: number }
  return {
    data: result.data instanceof Float32Array ? result.data : new Float32Array(result.data),
    sampleRate: result.sampleRate ?? 24000,
  };
}

/* ── React Hook ────────────────────────────────────────────────────── */

export function useKokoroTTS() {
  const [status, setStatusLocal] = useState<KokoroStatus>(_status);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const listener: Listener = (s) => {
      if (mountedRef.current) setStatusLocal(s);
    };
    listeners.add(listener);
    // Sync immediately in case status changed between render and effect.
    setStatusLocal(_status);
    return () => {
      mountedRef.current = false;
      listeners.delete(listener);
    };
  }, []);

  const load = useCallback(() => {
    void loadKokoro();
  }, []);

  return {
    status,
    error: _error,
    load,
    isReady: status === "ready",
    isDownloading: status === "downloading",
    voices: toSyntheticVoices(),
  };
}
