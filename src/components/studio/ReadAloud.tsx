// ReadAloud — browser-native text-to-speech player.
//
// Uses the Web SpeechSynthesis API to render audio on the user's device
// (the browser/OS does the speaking; nothing is recorded or cached).
// Only a tiny preference blob (chosen voice name, rate, auto-advance
// toggle) is kept in localStorage — 100 bytes tops.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pause, Play, Square, Volume2, X, Repeat } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

const PREFS_KEY = "atelier.readAloud.prefs";

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

// Edge voices are labelled "... Online (Natural)", Chrome uses
// "Google ...", and iOS uses Siri voices named like "Samantha".
// We surface natural / neural / Siri first so the default is the
// nicest voice on each platform, then let the user pick ANY English
// voice regardless of quality label.
function isNaturalVoice(name: string): boolean {
  // On iOS Safari every voice uses the high-quality Siri engine —
  // there's no offline/online distinction.  Voice names are just
  // person names ("Samantha", "Daniel", "Karen", …) so the
  // keyword checks below would miss them.  Short-circuit: all
  // voices on iOS are natural.
  if (
    typeof navigator !== "undefined" &&
    /iPhone|iPad|iPod/.test(navigator.userAgent)
  ) {
    return true;
  }
  const n = name.toLowerCase();
  return (
    n.includes("natural") ||
    n.includes("neural") ||
    n.includes("online") ||
    n.includes("premium") ||
    n.includes("enhanced") ||
    n.includes("google") ||
    n.includes("siri")
  );
}

export interface ReadAloudController {
  /** Jump playback to the given readable-paragraph index. */
  jumpTo: (idx: number) => void;
  /** Whether the player is currently active (open or playing). */
  isActive: () => boolean;
}

interface ReadAloudProps {
  /** Paragraphs to read in order (translated English or original). */
  paragraphs: string[];
  /** Stable id that changes when the document (chapter) changes. */
  documentId: string;
  /** Whether there is a next chapter to auto-advance into. */
  hasNext: boolean;
  onAdvanceNext: () => void;
  /** Whether translated text is being read (vs original). */
  isTranslation: boolean;
  /** Optional ref that the parent uses to programmatically jump. */
  controllerRef?: React.MutableRefObject<ReadAloudController | null>;
}

export function ReadAloud({
  paragraphs,
  documentId,
  hasNext,
  onAdvanceNext,
  isTranslation,
  controllerRef,
}: ReadAloudProps) {
  // ── Voices ────────────────────────────────────────────────────────────
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth) return;
    const load = () => {
      try {
        setVoices(synth.getVoices?.() ?? []);
      } catch {
        setVoices([]);
      }
    };
    try { load(); } catch { /* noop */ }
    try { synth.addEventListener?.("voiceschanged", load); } catch { /* noop */ }
    return () => {
      try { synth.removeEventListener?.("voiceschanged", load); } catch { /* noop */ }
    };
  }, []);

  // Show ALL English voices (Natural first, then Standard) so the user
  // can pick any browser-provided voice, including Edge's "Sonia (Natural)".
  const englishVoices = useMemo(
    () =>
      voices.filter(
        (v) => v.lang.startsWith("en") || /english/i.test(v.name),
      ),
    [voices],
  );
  const naturalVoices = useMemo(
    () => englishVoices.filter((v) => isNaturalVoice(v.name)),
    [englishVoices],
  );

  const [prefs, setPrefs] = useState<ReadPrefs>(() => loadPrefs());

  const selectedVoice = useMemo(() => {
    if (prefs.voiceName) {
      const m = voices.find((v) => v.name === prefs.voiceName);
      if (m) return m;
    }
    return naturalVoices[0] ?? englishVoices[0] ?? voices[0] ?? null;
  }, [voices, naturalVoices, englishVoices, prefs.voiceName]);

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

  const advanceRequestedRef = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    };
  }, []);

  // Filter readable paragraphs (skip null/empty strings).
  const readable = useMemo(
    () => paragraphs.filter((p) => typeof p === "string" && p.trim().length > 0),
    [paragraphs],
  );

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

  /** Resolve the best voice from a fresh global-API snapshot, with a
   * natural-first English fallback.  Never depends on React state so
   * it works even on mobile where voices load lazily inside the first
   * user-gesture speak() call. */
  function resolveVoice(
    fresh: SpeechSynthesisVoice[],
    savedName: string | null,
  ): SpeechSynthesisVoice | null {
    if (savedName) {
      const m = fresh.find((v) => v.name === savedName);
      if (m) return m;
    }
    // First natural English, then any English, then anything.
    return (
      fresh.find(
        (v) =>
          isNaturalVoice(v.name) &&
          (v.lang.startsWith("en") || /english/i.test(v.name)),
      ) ??
      fresh.find(
        (v) => v.lang.startsWith("en") || /english/i.test(v.name),
      ) ??
      fresh[0] ??
      null
    );
  }

  /** Create and speak an utterance for a single paragraph index,
   * using the pre-resolved voice.  Called either directly (when
   * natural voices are already available) or from the warm-up
   * callback (after forcing remote-voice loading on mobile). */
  function speakUtterance(idx: number, voice: SpeechSynthesisVoice | null) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const ctx = ctxRef.current;
    const text = ctx.readable[idx];
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.rate = ctx.prefs.rate;
      utterance.pitch = ctx.prefs.pitch;
      utterance.lang = voice?.lang ?? "en-US";
      utterance.onstart = () => {
        if (!isMountedRef.current) return;
        setCurrentIdx(idx);
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
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
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
    // Mobile browsers (Edge Android, Chrome Android) only load remote /
    // online voices after the engine actually processes a speak() call
    // inside a user gesture.  The old "speak empty + instant cancel"
    // was too fast to trigger initialisation.
    //
    // Strategy: speak a real character "." at volume 0, wait for the
    // onstart event (proving the engine pipeline is alive), THEN cancel
    // and re-read voices.  A 500 ms safety timeout prevents hanging if
    // onstart never fires (e.g. no voices at all).
    const freshVoices = synth.getVoices?.() ?? [];
    const hasNatural = freshVoices.some(
      (v) =>
        isNaturalVoice(v.name) &&
        (v.lang.startsWith("en") || /english/i.test(v.name)),
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
        // Safety: if onstart never fires (e.g. no TTS engine at all),
        // bail after 500 ms and proceed with whatever voices we have.
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

  // ── Jump-to-paragraph (exposed to the parent via controllerRef) ────────
  const jumpTo = useCallback((idx: number) => {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setCurrentIdx(idx);
    setPlaying(true);
    setPaused(false);
    speakImplRef.current(idx);
  }, []);

  // Let the parent detect whether we're active (so it can render
  // paragraph click targets).
  const isActive = useCallback(() => open || playing, [open, playing]);

  // Expose the controller to the parent via the mutable ref.
  const ctrl = useMemo(() => ({ jumpTo, isActive }), [jumpTo, isActive]);
  useEffect(() => {
    if (controllerRef) {
      controllerRef.current = ctrl;
      return () => { controllerRef.current = null; };
    }
  }, [controllerRef, ctrl]);

  // ── UI actions ─────────────────────────────────────────────────────────
  const beginAt = useCallback((idx: number) => {
    // speakImplRef handles voice warm-up / resolution on its own — no
    // need to block here.  It reads voices directly from the global
    // API so it works even when React state hasn't caught up yet
    // (critical for mobile Edge where remote voices appear lazily).
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setOpen(true);
    setCurrentIdx(idx);
    setPlaying(true);
    setPaused(false);
    speakImplRef.current(idx);
  }, []);

  const onTogglePlay = useCallback(() => {
    const win = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!win) return;
    if (playing) {
      try {
        if (paused) {
          win.resume?.();
          setPaused(false);
        } else {
          win.pause?.();
          setPaused(true);
        }
      } catch {
        setPaused(false);
      }
      return;
    }
    beginAt(currentIdx);
  }, [playing, paused, beginAt, currentIdx]);

  const onStop = useCallback(() => {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setPlaying(false);
    setPaused(false);
    setCurrentIdx(0);
  }, []);

  const onClose = useCallback(() => {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setPlaying(false);
    setPaused(false);
    setCurrentIdx(0);
    setOpen(false);
  }, []);

  return (
    <>
      <ReadAloudTrigger
        onClick={() => {
          if (open || playing) {
            onClose();
            return;
          }
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
            className="fixed left-1/2 -translate-x-1/2 bottom-4 md:bottom-6 z-40 max-w-[calc(100vw-2rem)] w-[min(580px,calc(100vw-2rem))]"
          >
            <div className="bg-background/95 backdrop-blur border border-border shadow-md px-3 md:px-4 py-2.5 md:py-3 flex flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-2">
              {/* Play/Pause */}
              <button
                type="button"
                onClick={onTogglePlay}
                className={cn(
                  "h-9 w-9 grid place-items-center border border-border hover:border-foreground/40 transition-colors shrink-0",
                  playing && !paused && "bg-foreground text-background border-foreground",
                )}
                aria-label={playing && !paused ? "Pause read aloud" : "Play read aloud"}
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
                className="h-9 w-9 grid place-items-center border border-border hover:border-foreground/40 transition-colors shrink-0"
                aria-label="Stop read aloud"
                title="Stop"
              >
                <Square className="w-3.5 h-3.5" strokeWidth={1.6} />
              </button>

              {/* Progress label */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="studio-num text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                  {Math.min(currentIdx + 1, readable.length)} / {readable.length}
                </span>
                <div className="h-1 flex-1 bg-border overflow-hidden">
                  <div
                    className="h-full bg-foreground transition-all"
                    style={{
                      width: `${readable.length ? Math.min(100, ((currentIdx + 1) / readable.length) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="hidden md:inline text-[10px] uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">
                  {isTranslation ? "English" : "Original"}
                </span>
              </div>

              {/* Rate slider */}
              <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">
                  {prefs.rate < 0.75 ? "0.5×" : prefs.rate > 1.85 ? "2×" : `${prefs.rate.toFixed(1)}×`}
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
                  className="w-16 sm:w-20"
                  aria-label="Playback speed"
                />
              </div>

              {/* Auto-advance */}
              <button
                type="button"
                onClick={() => persist({ autoAdvance: !prefs.autoAdvance })}
                className={cn(
                  "h-9 px-2.5 inline-flex items-center gap-1 border text-[10px] uppercase tracking-[0.18em] shrink-0",
                  prefs.autoAdvance
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
                )}
                aria-label="Auto-advance to next chapter"
                title={hasNext ? "Auto-advance to next chapter" : "No next chapter"}
              >
                <Repeat className="w-3.5 h-3.5" strokeWidth={1.6} />
                <span className="hidden md:inline">Next</span>
              </button>

              {/* Voice picker — always visible, natural voices first */}
              <select
                value={selectedVoice?.name ?? ""}
                onChange={(e) => persist({ voiceName: e.target.value || null })}
                className="h-9 px-2 bg-transparent border border-border hover:border-foreground/40 text-[10px] uppercase tracking-[0.15em] text-foreground shrink-0 max-w-[140px] truncate"
                aria-label="Voice"
                title={selectedVoice ? `Voice: ${selectedVoice.name}` : "Default voice"}
              >
                {!selectedVoice && <option value="">Default</option>}
                {[
                  ...naturalVoices.map((v) => ({ v, kind: "Natural" })),
                  ...englishVoices.filter((v) => !isNaturalVoice(v.name)).map((v) => ({ v, kind: "Standard" })),
                ].map(({ v, kind }) => (
                  <option key={v.name} value={v.name}>
                    {kind === "Natural" ? "✦ " : ""}
                    {v.name.replace(/^Microsoft\s+/i, "").replace(/^Google\s+/i, "").slice(0, 32)}
                  </option>
                ))}
              </select>

              {/* Close */}
              <button
                type="button"
                onClick={onClose}
                className="h-9 w-9 grid place-items-center border border-border hover:border-foreground/40 transition-colors shrink-0"
                aria-label="Close read aloud"
              >
                <X className="w-4 h-4" strokeWidth={1.6} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
        "h-10 px-3 inline-flex items-center gap-2 border transition-colors cursor-pointer",
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
