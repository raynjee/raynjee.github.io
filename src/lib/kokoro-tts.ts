// Kokoro TTS — lazy-loading neural text-to-speech engine.
//
// Uses kokoro-js (Transformers.js + ONNX Runtime Web) to run the
// Kokoro-82M model entirely in the browser.  The model is ~92 MB
// (q8 quantized) and is cached in the browser's IndexedDB after the
// first download via HuggingFace Hub.
//
// Usage:
//   await loadKokoroModel((pct) => console.log(`${pct}%`));
//   const buf = await synthesizeWithKokoro("Hello", "af_bella");
//   // buf is an AudioBuffer ready for AudioContext playback.

// kokoro-js is imported dynamically inside loadKokoroModel() —
// NOT at the top level — so the heavy ONNX Runtime Web WASM chain
// only loads when the user explicitly switches to the Kokoro engine.
// Static imports would crash the page at module evaluation time on
// browsers where ONNX/WASM isn't available.

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

// ── Model state ───────────────────────────────────────────────────────

type Status = "unloaded" | "loading" | "ready" | "error";
type ProgressFn = (pct: number, statusMsg: string) => void;

let status: Status = "unloaded";
let instance: any = null;
let errorMsg = "";
const progressListeners = new Set<ProgressFn>();

function notifyProgress(pct: number, statusMsg: string) {
  for (const fn of progressListeners) {
    try { fn(pct, statusMsg); } catch { /* ignore */ }
  }
}

/** Subscribe to model-download progress.  Returns an unsubscribe function. */
export function onKokoroProgress(fn: ProgressFn): () => void {
  progressListeners.add(fn);
  // Replay current status immediately.
  if (status === "ready") fn(100, "Ready");
  else if (status === "error") fn(0, errorMsg);
  return () => { progressListeners.delete(fn); };
}

export function getKokoroStatus(): Status {
  return status;
}

// ── Loading ───────────────────────────────────────────────────────────

/**
 * Download and initialise the Kokoro-82M model (q8, ~92 MB).
 * Safe to call multiple times — subsequent calls are no-ops if the
 * model is already loaded or currently loading.
 */
export async function loadKokoroModel(onProgress?: ProgressFn): Promise<void> {
  if (instance) return;
  if (status === "loading") {
    // Wait for the in-flight load to finish.
    if (onProgress) {
      const unsub = onKokoroProgress(onProgress);
      // Poll until loading finishes (cheap — the real load is async).
      while (status === "loading") {
        await new Promise((r) => setTimeout(r, 200));
      }
      unsub();
      if (status === "ready") return;
      if (status === "error") throw new Error(errorMsg);
    }
    return;
  }

  status = "loading";
  errorMsg = "";
  notifyProgress(0, "Downloading model (92 MB)…");

  try {
    const { KokoroTTS } = await import("kokoro-js");
    instance = await KokoroTTS.from_pretrained(
      "onnx-community/Kokoro-82M-ONNX",
      {
        dtype: "q8",
        // The Transformers.js pipeline reports progress as numbers
        // or { status, ... }.  We normalise to 0-100.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress_callback: (info: any) => {
          let pct = 0;
          let msg = "Loading…";
          if (typeof info === "number") {
            pct = Math.round(info);
            msg = pct < 100 ? `Downloading model (${pct}%)` : "Initialising…";
          } else if (info && typeof info === "object") {
            pct = typeof info.progress === "number" ? Math.round(info.progress) : 0;
            msg =
              info.status ??
              (pct < 100 ? `Downloading model (${pct}%)` : "Initialising…");
          }
          notifyProgress(pct, msg);
          onProgress?.(pct, msg);
        },
      },
    );
    status = "ready";
    notifyProgress(100, "Ready");
  } catch (err) {
    status = "error";
    errorMsg = err instanceof Error ? err.message : String(err);
    notifyProgress(0, errorMsg);
    throw err;
  }
}

// ── Synthesis ─────────────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!_audioCtx) {
    _audioCtx = new AudioContext();
  }
  // Resume if suspended (browsers require a user gesture).
  if (_audioCtx.state === "suspended") {
    void _audioCtx.resume();
  }
  return _audioCtx;
}

/**
 * Synthesise text with the loaded Kokoro model.
 * Returns a Web Audio AudioBuffer ready for playback.
 * Throws if the model hasn't been loaded yet.
 */
export async function synthesizeWithKokoro(
  text: string,
  voice: string,
): Promise<AudioBuffer> {
  if (!instance) {
    throw new Error("Kokoro model not loaded yet — call loadKokoroModel() first");
  }

  const raw = await instance.generate(text, { voice: voice as any });
  const ctx = getAudioCtx();
  const buffer = ctx.createBuffer(1, raw.audio.length, raw.sampling_rate);
  buffer.getChannelData(0).set(raw.audio);
  return buffer;
}

/**
 * Play an AudioBuffer through the Web Audio API and return a Promise
 * that resolves when playback finishes (or rejects on error).
 */
export function playAudioBuffer(
  buffer: AudioBuffer,
  onEnded?: () => void,
): { stop: () => void; promise: Promise<void> } {
  const ctx = getAudioCtx();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  let settled = false;
  const promise = new Promise<void>((resolve, reject) => {
    source.onended = () => {
      if (settled) return;
      settled = true;
      onEnded?.();
      resolve();
    };
    // Some browsers don't fire onended reliably if stop() is called.
    // We handle that in the stop() closure.
  });

  const stop = () => {
    if (settled) return;
    settled = true;
    try { source.stop(); } catch { /* already stopped */ }
    try { source.disconnect(); } catch { /* noop */ }
  };

  source.start(0);

  return { stop, promise };
}
