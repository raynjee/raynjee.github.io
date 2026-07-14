// Kokoro voices — lightweight data module.
//
// This file contains ONLY voice definitions and model-download status
// tracking.  It has ZERO references to kokoro-js, phonemizer, or any
// ONNX/WASM dependencies.  Safe to import from any page (Settings,
// Library, etc.) without triggering heavy chunk loading.
//
// The actual model loading lives in kokoro-tts.ts and is only
// triggered on demand via loadKokoroModel().

// ── Voice types & data ──────────────────────────────────────────────────

export interface KokoroVoice {
  id: string;
  label: string;
}

/** All English voices shipped with Kokoro-82M, grouped by accent. */
export const KOKORO_VOICES: KokoroVoice[] = [
  // ── American female ─────────────────────────────────────────────
  { id: "af_bella", label: "Bella (US ♀)" },
  { id: "af_sky", label: "Sky (US ♀)" },
  { id: "af_heart", label: "Heart (US ♀)" },
  { id: "af_alloy", label: "Alloy (US ♀)" },
  { id: "af_aoede", label: "Aoede (US ♀)" },
  { id: "af_jessica", label: "Jessica (US ♀)" },
  { id: "af_kore", label: "Kore (US ♀)" },
  { id: "af_nicole", label: "Nicole (US ♀)" },
  { id: "af_nova", label: "Nova (US ♀)" },
  { id: "af_river", label: "River (US ♀)" },
  { id: "af_sarah", label: "Sarah (US ♀)" },
  // ── American male ───────────────────────────────────────────────
  { id: "am_adam", label: "Adam (US ♂)" },
  { id: "am_echo", label: "Echo (US ♂)" },
  { id: "am_eric", label: "Eric (US ♂)" },
  { id: "am_fenrir", label: "Fenrir (US ♂)" },
  { id: "am_liam", label: "Liam (US ♂)" },
  { id: "am_michael", label: "Michael (US ♂)" },
  { id: "am_onyx", label: "Onyx (US ♂)" },
  { id: "am_puck", label: "Puck (US ♂)" },
  { id: "am_santa", label: "Santa (US ♂)" },
  // ── British female ──────────────────────────────────────────────
  { id: "bf_emma", label: "Emma (UK ♀)" },
  { id: "bf_isabella", label: "Isabella (UK ♀)" },
  { id: "bf_alice", label: "Alice (UK ♀)" },
  { id: "bf_lily", label: "Lily (UK ♀)" },
  // ── British male ────────────────────────────────────────────────
  { id: "bm_daniel", label: "Daniel (UK ♂)" },
  { id: "bm_george", label: "George (UK ♂)" },
  { id: "bm_lewis", label: "Lewis (UK ♂)" },
  { id: "bm_fable", label: "Fable (UK ♂)" },
];

/** American voices only (for the Settings card gallery). */
export const KOKORO_US_VOICES = KOKORO_VOICES.filter(
  (v) => v.id.startsWith("af_") || v.id.startsWith("am_"),
);

// ── Model-download status (shared with kokoro-tts.ts) ──────────────────

export type KokoroStatus = "unloaded" | "loading" | "ready" | "error";
export type KokoroProgressFn = (pct: number, statusMsg: string) => void;

let _status: KokoroStatus = "unloaded";
let _errorMsg = "";
const _listeners = new Set<KokoroProgressFn>();

function notify(pct: number, msg: string) {
  for (const fn of _listeners) {
    try { fn(pct, msg); } catch { /* ignore */ }
  }
}

/** Subscribe to model-download progress.  Returns an unsubscribe function. */
export function onKokoroProgress(fn: KokoroProgressFn): () => void {
  _listeners.add(fn);
  if (_status === "ready") fn(100, "Ready");
  else if (_status === "error") fn(0, _errorMsg);
  return () => { _listeners.delete(fn); };
}

export function getKokoroStatus(): KokoroStatus {
  return _status;
}

// Internal setters — called by kokoro-tts.ts during the actual download.
export function _setKokoroStatus(s: KokoroStatus, err?: string) {
  _status = s;
  if (s === "error" && err) _errorMsg = err;
}

export function _notifyKokoroProgress(pct: number, msg: string) {
  notify(pct, msg);
}

// ── Model loading (lazy bridge to the heavy kokoro-tts module) ─────────

/**
 * Download and initialise the Kokoro-82M model (~92 MB).
 * Only imports the heavy kokoro-js dependency when actually called.
 */
export async function loadKokoroModel(onProgress?: KokoroProgressFn): Promise<void> {
  // Dynamically import the heavy module — this triggers kokoro-js
  // loading, but only when the user explicitly clicks "Download".
  const mod = await import("./kokoro-tts");
  await mod._loadKokoroModelImpl(onProgress);
}
