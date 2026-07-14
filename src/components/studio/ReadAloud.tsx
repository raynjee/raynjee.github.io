// ReadAloud — browser-native text-to-speech player.
//
// Uses the Web SpeechSynthesis API to render audio on the user's device
// (the browser/OS does the speaking; nothing is recorded or cached).
// Only a tiny preference blob (chosen voice name, rate, auto-advance
// toggle) is kept in localStorage — 100 bytes tops.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pause, Play, Square, Volume2, X, FastForward, Repeat } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

// Edge voices are labelled "... Online (Natural)" — and Chrome uses
// "Google ..." with both local and network voices. We surface those
// first so the default is the nicest voice on each platform.
function isNaturalVoice(name: string): boolean {
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

interface ReadAloudProps {
  // Paragraphs to read in order. Should be the translated English text
  // when available, falling back to the original chapter text.
  paragraphs: string[];
  // Identity of the current "document" — when this changes (the user
  // navigated to a new chapter), we reset the player position.
  documentId: string;
  // True when there is a next chapter we can auto-advance to. The player
  // calls onAdvanceNext() when it hits the end of the current document.
  hasNext: boolean;
  onAdvanceNext: () => void;
  // Whether translated paragraphs are being substituted in here vs the
  // raw original. Drives a small UI label.
  isTranslation: boolean;
}

export function ReadAloud({
  paragraphs,
  documentId,
  hasNext,
  onAdvanceNext,
  isTranslation,
}: ReadAloudProps) {
  // ── Voices ────────────────────────────────────────────────────────────
  // Voice lists arrive asynchronously on most browsers; speechSynthesis
  // fires `voiceschanged` when they're ready. We bail out entirely if
  // the API isn't available (very old browsers, locked-down sandboxes)
  // and never throw — leaving voices empty simply disables TTS.
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

  // Resolve the actually-set voice object (by name match) so we don't
  // pass a stale reference to the speechSynthesis API.
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

  // Toggle set when WE asked the parent to jump to the next chapter.
  // The documentId-change effect reads it to decide whether to keep
  // playing on the new chapter instead of halting.
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

  // `ctxRef` bundles everything speakImpl needs to see fresh values
  // without forcing the speech callbacks to be re-bound on every render.
  const ctxRef = useRef({
    readable: [] as string[],
    voices: [] as SpeechSynthesisVoice[],
    prefs: DEFAULT_PREFS,
    advance: () => {},
    hasNext: false,
  });
  ctxRef.current.readable = readable;
  ctxRef.current.voices = voices;
  ctxRef.current.prefs = prefs;
  ctxRef.current.advance = onAdvanceNext;
  ctxRef.current.hasNext = hasNext;

  // speakImplRef holds the latest implementation of `speak(i)`. Keeping
  // it in a ref lets any callback (effect, button handler) call it
  // without including it in their dep arrays — preventing loops.
  const speakImplRef = useRef<(idx: number) => void>(() => {});
  speakImplRef.current = (idx: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    const win = window.speechSynthesis;
    if (!win) return;
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
    const text = ctx.readable[idx];
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice =
        ctx.voices.find((v) => v.name === ctx.prefs.voiceName) ?? null;
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
        // `interrupted` and `canceled` are normal lifecycle events. Only
        // surface real failures with a toast.
        const err = (ev as SpeechSynthesisErrorEvent).error;
        if (err && err !== "interrupted" && err !== "canceled") {
          toast.error(`Read aloud failed: ${err}`);
          setPlaying(false);
          setPaused(false);
        }
      };
      win.speak(utterance);
    } catch {
      // Speech engine rejected the utterance (often: document isn't
      // focused). Bail silently — the user can hit Play again.
      setPlaying(false);
      setPaused(false);
    }
  };

  // When the parent signals a chapter change, decide what to do:
  //   - if WE triggered it (autoAdvance), keep playing from paragraph 0
  //   - if the user navigated manually, stop and reset position to 0
  useEffect(() => {
    const wasAdvance = advanceRequestedRef.current;
    advanceRequestedRef.current = false;

    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setCurrentIdx(0);

    if (wasAdvance) {
      // Defer to the next tick so the new `readable` list has settled
      // through `useMemo` before speakImpl reads it.
      setPlaying(true);
      setPaused(false);
      queueMicrotask(() => speakImplRef.current(0));
    } else {
      setPlaying(false);
      setPaused(false);
    }
  }, [documentId, readable]);

  // Public actions consumed by the UI.
  const beginAt = useCallback((idx: number) => {
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
            className="fixed left-1/2 -translate-x-1/2 bottom-4 md:bottom-6 z-40 max-w-[calc(100vw-2rem)] w-[min(560px,calc(100vw-2rem))]"
          >
            <div className="bg-background/95 backdrop-blur border border-border shadow-md px-3 md:px-4 py-2.5 md:py-3 flex items-center gap-2 md:gap-3">
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

              {/* Rate cycle */}
              <button
                type="button"
                onClick={() => {
                  const cycle: Array<{ v: number; label: string }> = [
                    { v: 0.85, label: "Slow" },
                    { v: 1, label: "Regular" },
                    { v: 1.2, label: "Fast" },
                  ];
                  const cur = cycle.findIndex((c) => Math.abs(c.v - prefs.rate) < 0.001);
                  const next = cycle[(cur === -1 ? 1 : (cur + 1)) % cycle.length];
                  persist({ rate: next.v });
                  if (playing) {
                    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
                    speakImplRef.current(currentIdx);
                  }
                  toast(`Speed: ${next.label}`);
                }}
                className="h-9 px-2.5 inline-flex items-center gap-1 border border-border hover:border-foreground/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Cycle playback speed"
                title="Speed"
              >
                <FastForward className="w-3.5 h-3.5" strokeWidth={1.6} />
                <span className="hidden sm:inline">
                  {prefs.rate < 0.95 ? "Slow" : prefs.rate > 1.1 ? "Fast" : "1×"}
                </span>
              </button>

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

              {/* Voice picker — collapsed into a chip on small screens */}
              <select
                value={selectedVoice?.name ?? ""}
                onChange={(e) => persist({ voiceName: e.target.value || null })}
                className="h-9 px-2 bg-transparent border border-border hover:border-foreground/40 text-[10px] uppercase tracking-[0.15em] text-foreground shrink-0 hidden md:block max-w-[180px]"
                aria-label="Voice"
                title={selectedVoice ? `Voice: ${selectedVoice.name}` : "Default voice"}
              >
                {!selectedVoice && <option value="">Default voice</option>}
                {[
                  ...naturalVoices.map((v) => ({ v, kind: "Natural" })),
                  ...englishVoices.filter((v) => !isNaturalVoice(v.name)).map((v) => ({ v, kind: "Standard" })),
                ].map(({ v, kind }) => (
                  <option key={v.name} value={v.name}>
                    {kind === "Natural" ? "✦ " : ""}
                    {kind}: {v.name.replace(/^Microsoft\s+/i, "").replace(/^Google\s+/i, "")}
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
      <span className="text-xs uppercase tracking-[0.18em]">Listen</span>
    </button>
  );
}
