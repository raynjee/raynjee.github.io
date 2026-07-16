// ReadAloud — browser-native text-to-speech player.
//
// Uses the Web SpeechSynthesis API to render audio on the user's device
// (the browser/OS does the speaking; nothing is recorded or cached).
// Only a tiny preference blob (chosen voice name, rate, auto-advance
// toggle) is kept in localStorage — 100 bytes tops.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Pause,
  Play,
  Repeat,
  Square,
  Volume2,
  X,
} from "lucide-react";
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
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const load = () => {
      try { setVoices(synth.getVoices?.() ?? []); } catch { setVoices([]); }
    };
    try { load(); } catch { /* noop */ }
    try { synth.addEventListener?.("voiceschanged", load); } catch { /* noop */ }
    return () => {
      try { synth.removeEventListener?.("voiceschanged", load); } catch { /* noop */ }
    };
  }, []);

  const englishVoices = useMemo(
    () => voices.filter((v) => v.lang.startsWith("en") || /english/i.test(v.name)),
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
  // Voice picker dropdown open state
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);

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
    if (savedName) {
      const m = fresh.find((v) => v.name === savedName);
      if (m) return m;
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
    const synth = window.speechSynthesis;
    if (!synth) return;
    const ctx = ctxRef.current;
    const text = ctx.readable[idx];
    if (!text) return;
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
    const win = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!win) return;
    if (playing) {
      try {
        if (paused) { win.resume?.(); setPaused(false); }
        else { win.pause?.(); setPaused(true); }
      } catch { setPaused(false); }
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

  // Format voice name for display — strip vendor prefixes
  const voiceDisplay = useMemo(() => {
    if (!selectedVoice) return "Default voice";
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
    for (const v of [...naturalVoices, ...englishVoices.filter((v) => !isNaturalVoice(v.name))]) {
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
                      {isNaturalVoice(selectedVoice?.name ?? "") && (
                        <span className="text-[9px] text-emerald-400 mr-0.5">✦</span>
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
                  <AnimatePresence>
                    {voiceDropdownOpen && (
                      <>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.1 }}
                          className="fixed inset-0 z-30"
                          onClick={() => setVoiceDropdownOpen(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="absolute bottom-full left-0 mb-1.5 w-[260px] max-h-[220px] overflow-y-auto rounded-md border border-border bg-background shadow-lg z-40"
                        >
                          <div className="p-1">
                            {voiceOptions.map(({ v, kind }) => (
                              <button
                                key={v.name}
                                type="button"
                                onClick={() => {
                                  persist({ voiceName: v.name });
                                  setVoiceDropdownOpen(false);
                                  if (playing) {
                                    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
                                    speakImplRef.current(currentIdx);
                                  }
                                }}
                                className={cn(
                                  "w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors",
                                  "hover:bg-muted",
                                  selectedVoice?.name === v.name && "bg-foreground/10 font-medium",
                                )}
                              >
                                <span className="flex items-center gap-1.5">
                                  {kind === "Natural" && (
                                    <span className="text-[10px] text-emerald-400 shrink-0">✦</span>
                                  )}
                                  <span className="truncate">{v.name.replace(/^Microsoft\s+/i, "").replace(/^Google\s+/i, "")}</span>
                                </span>
                                <span className="text-[9px] text-muted-foreground ml-4">
                                  {kind} · {v.lang}
                                </span>
                              </button>
                            ))}
                            {voiceOptions.length === 0 && (
                              <div className="px-2.5 py-3 text-xs text-muted-foreground text-center">
                                No English voices found
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
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
