// Kokoro TTS — heavy synthesis module.
//
// This file imports kokoro-js dynamically (not at the top level)
// and contains the actual model loading, text-to-AudioBuffer synthesis,
// and Web Audio API playback helpers.
//
// Do NOT import this module from pages that should load instantly
// (Settings, Library).  Use kokoro-voices.ts instead — it has zero
// kokoro-js / phonemizer / ONNX references.
//
// The model-download status is shared with kokoro-voices.ts so the
// Settings card can show progress without importing this file.

import {
  _setKokoroStatus,
  _notifyKokoroProgress,
  getKokoroStatus,
  onKokoroProgress,
} from "./kokoro-voices";

// Re-export voices & status for convenience (ReadAloud imports from here).
export {
  KOKORO_VOICES,
  KOKORO_US_VOICES,
  onKokoroProgress,
  getKokoroStatus,
  loadKokoroModel,
} from "./kokoro-voices";
export type { KokoroVoice, KokoroStatus } from "./kokoro-voices";

// ── Model instance ──────────────────────────────────────────────────────

let instance: any = null;

// ── Loading (called via the lazy bridge in kokoro-voices.ts) ────────────

export async function _loadKokoroModelImpl(
  onProgress?: (pct: number, msg: string) => void,
): Promise<void> {
  if (instance) return;
  const current = getKokoroStatus();
  if (current === "loading") {
    // Wait for in-flight load.
    await new Promise<void>((resolve) => {
      const unsub = onKokoroProgress(() => {
        if (getKokoroStatus() !== "loading") {
          unsub();
          resolve();
        }
      });
    });
    return;
  }

  _setKokoroStatus("loading");
  _notifyKokoroProgress(0, "Downloading model (92 MB)…");

  try {
    const { KokoroTTS } = await import("kokoro-js");
    instance = await KokoroTTS.from_pretrained(
      "onnx-community/Kokoro-82M-ONNX",
      {
        dtype: "q8",
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
          _notifyKokoroProgress(pct, msg);
          onProgress?.(pct, msg);
        },
      },
    );
    _setKokoroStatus("ready");
    _notifyKokoroProgress(100, "Ready");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    _setKokoroStatus("error", msg);
    _notifyKokoroProgress(0, msg);
    throw err;
  }
}

// ── Synthesis ───────────────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!_audioCtx) {
    _audioCtx = new AudioContext();
  }
  if (_audioCtx.state === "suspended") {
    void _audioCtx.resume();
  }
  return _audioCtx;
}

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

export function playAudioBuffer(
  buffer: AudioBuffer,
  onEnded?: () => void,
): { stop: () => void; promise: Promise<void> } {
  const ctx = getAudioCtx();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  let settled = false;
  const promise = new Promise<void>((resolve) => {
    source.onended = () => {
      if (settled) return;
      settled = true;
      onEnded?.();
      resolve();
    };
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
