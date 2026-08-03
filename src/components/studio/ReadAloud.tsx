// ReadAloud — browser-native text-to-speech player.
//
// Uses the Web SpeechSynthesis API to render audio on the user's device
// (the browser/OS does the speaking; nothing is recorded or cached).
// Only a tiny preference blob (chosen voice name, rate, auto-advance
// toggle) is kept in localStorage — 100 bytes tops.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  Search,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import {
  useKokoroTTS,
  isKokoroVoice,
  kokoroVoiceId,
  generateSpeech,
  loadKokoro,
  type SyntheticVoice,
} from "@/hooks/use-kokoro";


const PREFS_KEY = "raynets.readAloud.prefs";

type ReadPrefs = {
  voiceName: string | null;
  rate: number;
  pitch: number;
  autoAdvance: boolean;
};

const DEFAULT_PREFS: ReadPrefs = {
  voiceName: null,
  rate: 1,
  pitch: 1,
  autoAdvance: true,
};

function loadPrefs(): ReadPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}
function savePrefs(p: ReadPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota */
  }
}

// Detect high-quality voices — Siri, Google, Neural, Natural, Premium, Enhanced.
// On iOS Safari the best voices are Siri voices; on Edge they're "Natural".
// We also include voices marked as "default" on some platforms (Safari's
// high-quality defaults) and exclude known-low-quality names like "Zarvox".
const LOW_QUALITY_PATTERNS = /\b(zarvox|bells|boing|bubbles|cellos|deranged|good news|hysterical|junior|organ|pipe|trinoids|whisper|bad news|bahh|albert|fred)\b/i;

function isNaturalVoice(name: string): boolean {
  if (LOW_QUALITY_PATTERNS.test(name)) return false;
  const n = name.toLowerCase();
  return (
    n.includes("natural") ||
    n.includes("neural") ||
    n.includes("online") ||
    n.includes("premium") ||
    n.includes("enhanced") ||
    n.includes("siri") ||
    n.includes("google") ||
    // iOS 17+ marks Siri voices as just the name without "Siri" in some regions
    (n.includes("samantha") && !n.includes("compact")) ||
    (n.includes("daniel") && n.includes("gb")) ||
    n.includes("aurelie") ||
    n.includes("karen") && n.includes("au")
  );
}

export interface ReadAloudController {
  jumpTo: (idx: number) => void;
  isActive: () => boolean;
}

interface ReadAloudProps {
  paragraphs: string[];
  documentId: string;
  hasNext: boolean;
  onAdvanceNext: () => void;
  isTranslation: boolean;
  controllerRef?: React.MutableRefObject<ReadAloudController | null>;
  /** Fires when reading advances to a new paragraph (passes readable-paragraph index). */
  onParagraphChange?: (readableIdx: number) => void;
}

export function ReadAloud({
  paragraphs,
  documentId,
  hasNext,
  onAdvanceNext,
  isTranslation,
  controllerRef,
  onParagraphChange,
}: ReadAloudProps) {
  // ── Voices ────────────────────────────────────────────────────────────
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicesRefreshing, setVoicesRefreshing] = useState(false);

  // ── Kokoro TTS (high-quality local neural voice) ───────────────────
  const kokoro = useKokoroTTS();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const kokoroPlayingRef = useRef(false);
  const kokoroPausedRef = useRef(false);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      // Safari needs the webkit prefix in older versions
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    // Resume immediately — iOS Safari requires this during user gesture.
    // If called outside a gesture, resume() is a no-op (won't throw).
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Load voices — on iOS Safari voices may load asynchronously after first
  // user interaction. We poll `voiceschanged` and also attempt a warm-up
  // utterance that forces the OS voice registry to populate.
  const refreshVoices = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    setVoicesRefreshing(true);

    const collect = () => {
      try {
        const v = synth.getVoices?.() ?? [];
        setVoices(v);
      } catch { /* noop */ }
      setVoicesRefreshing(false);
    };

    // On iOS, getVoices() may return [] on the first call. Speak a silent
    // utterance to force the voice registry to load.
    const current = synth.getVoices?.() ?? [];
    if (current.length === 0) {
      try {
        const wu = new SpeechSynthesisUtterance("");
        wu.volume = 0;
        wu.rate = 2;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          try { synth.cancel(); } catch { /* noop */ }
          collect();
        };
        wu.onstart = finish;
        wu.onend = finish;
        wu.onerror = finish;
        synth.speak(wu);
        setTimeout(finish, 600);
      } catch {
        collect();
      }
    } else {
      collect();
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    // Initial load
    refreshVoices();

    // Listen for async voice loading (critical on iOS / Safari)
    const onVoicesChanged = () => refreshVoices();
    try { synth.addEventListener?.("voiceschanged", onVoicesChanged); } catch { /* noop */ }

    return () => {
      try { synth.removeEventListener?.("voiceschanged", onVoicesChanged); } catch { /* noop */ }
    };
  }, [refreshVoices]);

  // Merge native SpeechSynthesis voices with Kokoro synthetic voices.
  const allVoices = useMemo(() => {
    const native = voices.filter((v) => v.lang.startsWith("en") || /english/i.test(v.name));
    if (kokoro.isReady) {
      const kokoroVoices = kokoro.voices as unknown as SpeechSynthesisVoice[];
      return [...kokoroVoices, ...native];
    }
    return native;
  }, [voices, kokoro.isReady, kokoro.voices]);

  const englishVoices = allVoices;
  const naturalVoices = useMemo(
    () => englishVoices.filter((v) => isNaturalVoice(v.name) || isKokoroVoice(v.voiceURI)),
    [englishVoices],
  );

  const [prefs, setPrefs] = useState<ReadPrefs>(() => loadPrefs());

  const selectedVoice = useMemo(() => {
    if (prefs.voiceName) {
      // Search merged voices (native + Kokoro) so Kokoro selections persist across remounts
      const m = allVoices.find((v) => v.name === prefs.voiceName);
      if (m) return m;
    }
    return naturalVoices[0] ?? englishVoices[0] ?? allVoices[0] ?? null;
  }, [allVoices, naturalVoices, englishVoices, prefs.voiceName]);

  const persist = useCallback((next: Partial<ReadPrefs>) => {
    setPrefs((prev) => {
      const merged = { ...prev, ...next };
      savePrefs(merged);
      return merged;
    });
  }, []);

  // ── Playback state ────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  // Voice picker dropdown open state
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);
  const [voiceSearch, setVoiceSearch] = useState("");

  const advanceRequestedRef = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    };
  }, []);

  const readable = useMemo(
    () => paragraphs.filter((p) => typeof p === "string" && p.trim().length > 0),
    [paragraphs],
  );

  const onParagraphChangeRef = useRef(onParagraphChange);
  onParagraphChangeRef.current = onParagraphChange;

  const ctxRef = useRef({
    readable: [] as string[],
    voices: [] as SpeechSynthesisVoice[],
    selectedVoice: null as SpeechSynthesisVoice | null,
    prefs: DEFAULT_PREFS,
    advance: () => {},
    hasNext: false,
  });
  ctxRef.current.readable = readable;
  ctxRef.current.voices = voices;
  ctxRef.current.selectedVoice = selectedVoice;
  ctxRef.current.prefs = prefs;
  ctxRef.current.advance = onAdvanceNext;
  ctxRef.current.hasNext = hasNext;

  function resolveVoice(
    fresh: SpeechSynthesisVoice[],
    savedName: string | null,
  ): SpeechSynthesisVoice | null {
    // If a Kokoro voice is selected, use it directly — it won't be in native voices
    const sel = ctxRef.current.selectedVoice;
    if (sel && isKokoroVoice(sel.voiceURI)) return sel;
    if (savedName) {
      // Search merged voices (native + Kokoro) first
      const m = ctxRef.current.selectedVoice;
      if (m && m.name === savedName) return m;
      // Then try native voices
      const n = fresh.find((v) => v.name === savedName);
      if (n) return n;
    }
    return (
      fresh.find(
        (v) => isNaturalVoice(v.name) && (v.lang.startsWith("en") || /english/i.test(v.name)),
      ) ??
      fresh.find((v) => v.lang.startsWith("en") || /english/i.test(v.name)) ??
      fresh[0] ??
      null
    );
  }

  function speakUtterance(idx: number, voice: SpeechSynthesisVoice | null) {
    const ctx = ctxRef.current;
    const text = ctx.readable[idx];
    if (!text) return;

    // ── Kokoro path: generate audio buffer + Web Audio API playback ──
    if (voice && isKokoroVoice(voice.voiceURI)) {
      const voiceId = kokoroVoiceId(voice.voiceURI);
      // Stop any previously playing Kokoro source to avoid overlap
      try { activeSourceRef.current?.stop(); } catch { /* noop */ }
      activeSourceRef.current = null;
      kokoroPlayingRef.current = true;
      kokoroPausedRef.current = false;

      setCurrentIdx(idx);
      onParagraphChangeRef.current?.(idx);

      // MUST resume AudioContext synchronously before the async call.
      // iOS Safari drops the "user gesture" token after ~1s of async work.
      const audioCtx = getAudioCtx();

      generateSpeech(text, voiceId, ctx.prefs.rate)
        .then((result) => {
          if (!isMountedRef.current || !kokoroPlayingRef.current) return;
          // Double-check resume in case it was re-suspended
          if (audioCtx.state === "suspended") {
            audioCtx.resume().catch(() => {});
          }
          const buffer = audioCtx.createBuffer(1, result.data.length, result.sampleRate);
          buffer.copyToChannel(new Float32Array(result.data), 0);
          const source = audioCtx.createBufferSource();
          source.buffer = buffer;
          source.playbackRate.value = ctx.prefs.rate;
          source.connect(audioCtx.destination);
          activeSourceRef.current = source;
          source.onended = () => {
            if (!isMountedRef.current) return;
            activeSourceRef.current = null;
            kokoroPlayingRef.current = false;
            speakImplRef.current(idx + 1);
          };
          source.start();
        })
        .catch((err) => {
          console.error("Kokoro generation failed:", err);
          toast.error("Kokoro voice failed — falling back to native TTS.");
          kokoroPlayingRef.current = false;
          // Fallback to native SpeechSynthesis
          const fallbackVoice = naturalVoices.find((v) => !isKokoroVoice(v.voiceURI)) ?? englishVoices[0] ?? null;
          speakUtterance(idx, fallbackVoice);
        });
      return;
    }

    // ── Native SpeechSynthesis path ────────────────────────────────
    const synth = window.speechSynthesis;
    if (!synth) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.rate = ctx.prefs.rate;
      utterance.pitch = ctx.prefs.pitch;
      utterance.lang = voice?.lang ?? "en-US";
      utterance.onstart = () => {
        if (!isMountedRef.current) return;
        setCurrentIdx(idx);
        onParagraphChangeRef.current?.(idx);
      };
      utterance.onend = () => {
        if (!isMountedRef.current) return;
        speakImplRef.current(idx + 1);
      };
      utterance.onerror = (ev) => {
        const err = (ev as SpeechSynthesisErrorEvent).error;
        if (err && err !== "interrupted" && err !== "canceled") {
          toast.error(`Read aloud failed: ${err}`);
          setPlaying(false);
          setPaused(false);
        }
      };
      synth.speak(utterance);
    } catch {
      setPlaying(false);
      setPaused(false);
    }
  }

  const speakImplRef = useRef<(idx: number) => void>(() => {});
  speakImplRef.current = (idx: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const ctx = ctxRef.current;
    if (idx >= ctx.readable.length) {
      setPlaying(false);
      setPaused(false);
      setCurrentIdx(ctx.readable.length);
      if (ctx.prefs.autoAdvance && ctx.hasNext && isMountedRef.current) {
        toast("Advancing to the next chapter…", { icon: "⏭️" });
        advanceRequestedRef.current = true;
        ctx.advance();
      } else if (isMountedRef.current) {
        toast("Finished reading.");
      }
      return;
    }

    // ── Aggressive voice warm-up (critical for mobile Edge) ──────
    const freshVoices = synth.getVoices?.() ?? [];
    const hasNatural = freshVoices.some(
      (v) => isNaturalVoice(v.name) && (v.lang.startsWith("en") || /english/i.test(v.name)),
    );

    const proceed = (voicesSnapshot: SpeechSynthesisVoice[]) => {
      const voice = resolveVoice(voicesSnapshot, ctx.prefs.voiceName);
      if (voicesSnapshot.length !== voices.length) {
        setVoices(voicesSnapshot);
      }
      speakUtterance(idx, voice);
    };

    if (!hasNatural && freshVoices.length > 0) {
      try {
        const wu = new SpeechSynthesisUtterance(".");
        wu.volume = 0;
        wu.rate = 2;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          try { synth.cancel(); } catch { /* noop */ }
          const updated = synth.getVoices?.() ?? freshVoices;
          proceed(updated);
        };
        wu.onstart = finish;
        wu.onerror = finish;
        synth.speak(wu);
        setTimeout(finish, 500);
        return;
      } catch {
        /* proceed with whatever we had */
      }
    }

    proceed(freshVoices);
  };

  useEffect(() => {
    const wasAdvance = advanceRequestedRef.current;
    advanceRequestedRef.current = false;
    setCurrentIdx(0);

    if (wasAdvance) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      setPlaying(true);
      setPaused(false);
      queueMicrotask(() => speakImplRef.current(0));
    } else if (playing) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      setPlaying(false);
      setPaused(false);
    }
  }, [documentId, readable]);

  const jumpTo = useCallback((idx: number) => {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setCurrentIdx(idx);
    setPlaying(true);
    setPaused(false);
    speakImplRef.current(idx);
  }, []);

  const isActive = useCallback(() => open || playing, [open, playing]);

  const ctrl = useMemo(() => ({ jumpTo, isActive }), [jumpTo, isActive]);
  useEffect(() => {
    if (controllerRef) {
      controllerRef.current = ctrl;
      return () => { controllerRef.current = null; };
    }
  }, [controllerRef, ctrl]);

  // ── UI actions ─────────────────────────────────────────────────────────
  const beginAt = useCallback((idx: number) => {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setOpen(true);
    setCurrentIdx(idx);
    setPlaying(true);
    setPaused(false);
    speakImplRef.current(idx);
  }, []);

  const onTogglePlay = useCallback(() => {
    if (playing) {
      // Kokoro audio pause/resume via AudioContext
      if (kokoroPlayingRef.current) {
        const audioCtx = audioCtxRef.current;
        if (paused) { audioCtx?.resume(); kokoroPausedRef.current = false; setPaused(false); }
        else { audioCtx?.suspend(); kokoroPausedRef.current = true; setPaused(true); }
        return;
      }
      // Native SpeechSynthesis pause/resume
      const win = typeof window !== "undefined" ? window.speechSynthesis : null;
      if (!win) return;
      try {
        if (paused) { win.resume?.(); setPaused(false); }
        else { win.pause?.(); setPaused(true); }
      } catch { setPaused(false); }
      return;
    }
    beginAt(currentIdx);
  }, [playing, paused, beginAt, currentIdx]);

  const onStop = useCallback(() => {
    // Stop Kokoro audio
    try { activeSourceRef.current?.stop(); } catch { /* noop */ }
    activeSourceRef.current = null;
    kokoroPlayingRef.current = false;
    kokoroPausedRef.current = false;
    // Stop native SpeechSynthesis
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setPlaying(false);
    setPaused(false);
    setCurrentIdx(0);
  }, []);

  const onClose = useCallback(() => {
    try { activeSourceRef.current?.stop(); } catch { /* noop */ }
    activeSourceRef.current = null;
    kokoroPlayingRef.current = false;
    kokoroPausedRef.current = false;
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setPlaying(false);
    setPaused(false);
    setCurrentIdx(0);
    setOpen(false);
  }, []);

  // Format voice name for display — strip vendor prefixes
  const voiceDisplay = useMemo(() => {
    if (!selectedVoice) return "Default voice";
    if (isKokoroVoice(selectedVoice.voiceURI)) {
      // Strip "Kokoro: " prefix for cleaner display
      return selectedVoice.name.replace(/^Kokoro:\s*/i, "").slice(0, 36);
    }
    return selectedVoice.name
      .replace(/^Microsoft\s+/i, "")
      .replace(/^Google\s+/i, "")
      .replace(/\s*\(Natural\)\s*/i, "")
      .slice(0, 36);
  }, [selectedVoice]);

  // All voices grouped for the dropdown
  const voiceOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ v: SpeechSynthesisVoice; kind: string }> = [];
    // Kokoro voices first (premium)
    for (const v of naturalVoices.filter((v) => isKokoroVoice(v.voiceURI))) {
      if (seen.has(v.name)) continue;
      seen.add(v.name);
      result.push({ v, kind: "Kokoro" });
    }
    // Then native voices
    for (const v of [...naturalVoices.filter((v) => !isKokoroVoice(v.voiceURI)), ...englishVoices.filter((v) => !isNaturalVoice(v.name) && !isKokoroVoice(v.voiceURI))]) {
      if (seen.has(v.name)) continue;
      seen.add(v.name);
      result.push({ v, kind: isNaturalVoice(v.name) ? "Natural" : "Standard" });
    }
    return result;
  }, [naturalVoices, englishVoices]);

  return (
    <>
      <ReadAloudTrigger
        onClick={() => {
          if (open || playing) { onClose(); return; }
          beginAt(0);
        }}
        active={open || playing}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 -translate-x-1/2 bottom-4 md:bottom-6 z-40 w-[calc(100vw-1.5rem)] max-w-[420px]"
          >
            <div className="bg-background border border-border shadow-lg rounded-lg overflow-hidden">
              {/* ── Top row: transport controls + progress ────────── */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                {/* Play/Pause */}
                <button
                  type="button"
                  onClick={onTogglePlay}
                  className={cn(
                    "h-9 w-9 grid place-items-center rounded-md border transition-colors shrink-0",
                    playing && !paused
                      ? "bg-foreground text-background border-foreground"
                      : "border-border hover:border-foreground/40",
                  )}
                  aria-label={playing && !paused ? "Pause" : "Play"}
                >
                  {playing && !paused ? (
                    <Pause className="w-4 h-4" strokeWidth={1.6} />
                  ) : (
                    <Play className="w-4 h-4" strokeWidth={1.6} />
                  )}
                </button>

                {/* Stop */}
                <button
                  type="button"
                  onClick={onStop}
                  className="h-9 w-9 grid place-items-center rounded-md border border-border hover:border-foreground/40 transition-colors shrink-0"
                  aria-label="Stop"
                  title="Stop"
                >
                  <Square className="w-3.5 h-3.5" strokeWidth={1.6} />
                </button>

                {/* Progress bar + label */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <div className="h-1.5 flex-1 bg-border/60 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-foreground rounded-full"
                      layout
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        width: `${readable.length ? Math.min(100, (currentIdx / readable.length) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap font-medium">
                    {Math.min(currentIdx + 1, readable.length)}/{readable.length}
                  </span>
                </div>

                {/* Close */}
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 w-9 grid place-items-center rounded-md border border-border hover:border-foreground/40 transition-colors shrink-0"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" strokeWidth={1.6} />
                </button>
              </div>

              {/* ── Divider ──────────────────────────────────────── */}
              <div className="border-t border-border" />

              {/* ── Bottom row: voice + speed + auto-advance ────── */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 flex-wrap">
                {/* Voice picker — styled dropdown */}
                <div className="relative flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setVoiceDropdownOpen((v) => !v)}
                    className={cn(
                      "w-full h-9 px-2.5 inline-flex items-center justify-between gap-1.5 rounded-md border text-xs transition-colors truncate",
                      "border-border hover:border-foreground/40",
                      voiceDropdownOpen && "border-foreground/40",
                    )}
                    title={selectedVoice?.name ?? "Default"}
                  >
                    <span className="truncate text-left">
                      <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground mr-1.5">
                        Voice
                      </span>
                      {selectedVoice && isKokoroVoice(selectedVoice.voiceURI) && (
                        <span className="text-[9px] text-emerald-400 mr-0.5">✦</span>
                      )}
                      {!isKokoroVoice(selectedVoice?.voiceURI ?? "") && isNaturalVoice(selectedVoice?.name ?? "") && (
                        <span className="text-[9px] text-emerald-400/60 mr-0.5">✦</span>
                      )}
                      {voiceDisplay}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform",
                        voiceDropdownOpen && "rotate-180",
                      )}
                      strokeWidth={1.6}
                    />
                  </button>
                </div>

                {/* Rate control */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                    Speed
                  </span>
                  <Slider
                    value={[prefs.rate]}
                    min={0.5}
                    max={2}
                    step={0.05}
                    onValueChange={([v]) => {
                      if (!v) return;
                      persist({ rate: v });
                      if (playing) {
                        try { window.speechSynthesis.cancel(); } catch { /* noop */ }
                        speakImplRef.current(currentIdx);
                      }
                    }}
                    className="w-16"
                    aria-label="Playback speed"
                  />
                  <span className="text-[10px] tabular-nums text-foreground/80 w-7 text-right font-medium">
                    {prefs.rate.toFixed(1)}×
                  </span>
                </div>

                {/* Auto-advance toggle */}
                <button
                  type="button"
                  onClick={() => persist({ autoAdvance: !prefs.autoAdvance })}
                  className={cn(
                    "h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border text-[10px] uppercase tracking-[0.12em] shrink-0 transition-colors",
                    prefs.autoAdvance
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
                  )}
                  aria-label="Auto-advance"
                  title={hasNext ? "Auto-advance to next chapter" : "No next chapter"}
                >
                  <Repeat className="w-3 h-3" strokeWidth={1.6} />
                  Next
                </button>
              </div>

              {/* ── Reading mode label ──────────────────────────── */}
              <div className="border-t border-border px-3 py-1.5">
                <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/60">
                  Reading {isTranslation ? "English translation" : "original text"}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice picker modal — rendered via portal to escape framer-motion transforms */}
      {voiceDropdownOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setVoiceDropdownOpen(false); setVoiceSearch(""); }} />
          <div className="relative w-full max-w-[420px] max-h-[75vh] flex flex-col rounded-t-xl border border-border bg-background shadow-2xl overflow-hidden">
            <div className="flex items-center justify-center pt-2 pb-1"><div className="w-10 h-1 rounded-full bg-muted-foreground/30" /></div>
            <div className="px-3 pb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">Select Voice</h3>
              <button type="button" onClick={() => { setVoiceDropdownOpen(false); setVoiceSearch(""); }} className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted transition-colors"><X className="w-4 h-4" strokeWidth={1.6} /></button>
            </div>
            <div className="px-3 pb-2">
              <div className="flex items-center gap-2 px-3 h-9 rounded-md border border-border bg-muted/50">
                <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.4} />
                <input type="text" value={voiceSearch} onChange={(e) => setVoiceSearch(e.target.value)} placeholder="Search voices\u2026" className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground" />
                <button type="button" onClick={(e) => { e.stopPropagation(); refreshVoices(); }} disabled={voicesRefreshing} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Refresh voices"><RefreshCw className={cn("w-3.5 h-3.5", voicesRefreshing && "animate-spin")} strokeWidth={1.6} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {(() => {
                const q = voiceSearch.trim().toLowerCase();
                const filtered = q ? voiceOptions.filter(({ v }) => v.name.toLowerCase().includes(q) || v.lang.toLowerCase().includes(q)) : voiceOptions;
                const groups: Record<string, typeof filtered> = {};
                for (const item of filtered) { (groups[item.kind] ??= []).push(item); }
                const groupOrder = ["Kokoro", "Natural", "Standard"];
                return groupOrder.map((kind) => {
                  const items = groups[kind];
                  if (!items || items.length === 0) return null;
                  return (
                    <div key={kind} className="mb-2">
                      <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60 font-medium">{kind === "Kokoro" && "\u2726 "}{kind}</div>
                      {items.map(({ v, kind: k }) => (
                        <button key={v.name} type="button" onClick={() => { persist({ voiceName: v.name }); setVoiceDropdownOpen(false); setVoiceSearch(""); if (playing) { try { window.speechSynthesis.cancel(); } catch { /* noop */ } speakImplRef.current(currentIdx); } }} className={cn("w-full text-left px-3 py-2.5 text-sm rounded-lg transition-colors", "hover:bg-muted active:bg-muted/80", selectedVoice?.name === v.name && "bg-foreground/10 font-medium ring-1 ring-foreground/20")}>
                          <div className="flex items-center gap-2.5">
                            {k === "Kokoro" && <span className="text-emerald-400 text-xs">\u2726</span>}
                            {k === "Natural" && <span className="text-emerald-400/60 text-xs">\u2726</span>}
                            <span className="flex-1 truncate">{v.name.replace(/^Microsoft\s+/i, "").replace(/^Google\s+/i, "").replace(/^Kokoro:\s*/i, "")}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{v.lang}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                });
              })()}
              {voiceOptions.length === 0 && (<div className="px-3 py-8 text-sm text-muted-foreground text-center">No English voices found</div>)}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function ReadAloudTrigger({
  onClick,
  active,
}: {
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-11 px-3 sm:px-4 inline-flex items-center gap-2 rounded-lg border transition-all active:scale-95",
        active
          ? "bg-foreground text-background border-foreground"
          : "border-border hover:border-foreground/40",
      )}
      title={active ? "Read aloud is on" : "Read this chapter aloud"}
      aria-label="Read aloud"
    >
      <Volume2 className="w-4 h-4" strokeWidth={1.4} />
      <span className="hidden sm:inline text-xs uppercase tracking-[0.18em]">Listen</span>
    </button>
  );
}
