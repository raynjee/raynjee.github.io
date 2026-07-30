// RaynETS — minimalist landing.
// Hero with brand mark → feature cards → footer.

import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router";
import { ArrowRight, BookOpen, Globe, Heart, Shield, Sparkles } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";

/**
 * ♡ ChibiCat Mascot — a black-haired cat-eared girl reading with round glasses.
 * Hand-drawn inline SVG so she loads at the speed of HTML and never breaks.
 */
function ChibiCatMascot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Rayn the book cat — a cute chibi mascot"
    >
      <title>Rayn the book cat — mascot</title>
      <defs>
        <style>{`
          /* ── Tail wag ───────────────────────────────── */
          @keyframes tail-wag {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(6deg); }
            75% { transform: rotate(-6deg); }
          }
          .tail-group {
            transform-origin: 60px 156px;
            animation: tail-wag 2.8s ease-in-out infinite;
          }

          /* ── Left ear twitch ─────────────────────────── */
          @keyframes ear-twitch-left {
            0%, 80%, 100% { transform: rotate(0deg); }
            85% { transform: rotate(-8deg); }
            90% { transform: rotate(4deg); }
            95% { transform: rotate(-2deg); }
          }
          .ear-left {
            transform-origin: 46px 51px;
            animation: ear-twitch-left 4s ease-in-out infinite;
          }

          /* ── Right ear twitch ────────────────────────── */
          @keyframes ear-twitch-right {
            0%, 80%, 100% { transform: rotate(0deg); }
            86% { transform: rotate(8deg); }
            91% { transform: rotate(-4deg); }
            96% { transform: rotate(2deg); }
          }
          .ear-right {
            transform-origin: 113px 51px;
            animation: ear-twitch-right 4.5s ease-in-out infinite;
          }

          /* ── Subtle blink ────────────────────────────── */
          @keyframes blink {
            0%, 92%, 96%, 100% { transform: scaleY(1); }
            94% { transform: scaleY(0.05); }
          }
          .eye-blink {
            transform-origin: center;
            animation: blink 5s ease-in-out infinite;
          }
        `}</style>
      </defs>
      {/* ── Cat ears behind head ──────────────────────────── */}
      {/* Left ear */}
      <g className="ear-left">
        <polygon points="30,55 50,28 62,50" fill="#2d2d2d" />
        <polygon points="35,52 48,32 58,50" fill="#ffb3c6" />
      </g>
      {/* Right ear */}
      <g className="ear-right">
        <polygon points="130,55 110,28 98,50" fill="#2d2d2d" />
        <polygon points="125,52 112,32 102,50" fill="#ffb3c6" />
      </g>

      {/* ── Head ──────────────────────────────────────────── */}
      <ellipse cx="80" cy="68" rx="44" ry="40" fill="#ffe4d6" />

      {/* ── Black bob-cut hair ────────────────────────── */}
      <path d="M36,60 Q34,20 80,18 Q126,20 124,60 L124,72 Q120,58 116,58 L80,54 L44,58 Q40,58 36,72 Z" fill="#2d2d2d" />
      {/* Side hair tufts */}
      <path d="M36,62 Q30,76 34,84 Q38,80 40,70 Z" fill="#2d2d2d" />
      <path d="M124,62 Q130,76 126,84 Q122,80 120,70 Z" fill="#2d2d2d" />
      {/* Hair strands (subtle highlights) */}
      <path d="M50,50 Q48,40 52,28" stroke="#4a4a4a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M110,50 Q112,40 108,28" stroke="#4a4a4a" strokeWidth="1.2" fill="none" strokeLinecap="round" />

      {/* ── Round glasses ───────────────────────────────── */}
      {/* Left lens */}
      <circle cx="62" cy="68" r="14" stroke="#5c4033" strokeWidth="2.2" fill="rgba(255,255,255,0.15)" />
      {/* Right lens */}
      <circle cx="98" cy="68" r="14" stroke="#5c4033" strokeWidth="2.2" fill="rgba(255,255,255,0.15)" />
      {/* Bridge */}
      <path d="M76,66 Q80,62 84,66" stroke="#5c4033" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Temple arms */}
      <line x1="48" y1="65" x2="36" y2="60" stroke="#5c4033" strokeWidth="2" strokeLinecap="round" />
      <line x1="112" y1="65" x2="124" y2="60" stroke="#5c4033" strokeWidth="2" strokeLinecap="round" />

      {/* ── Cat eyes (big, with slit pupils) ─────────────── */}
      <g className="eye-blink">
        <ellipse cx="62" cy="65" rx="6" ry="6.5" fill="#4a3020" />
        <ellipse cx="62" cy="65" rx="3.2" ry="3.8" fill="#1a1a1a" />
        <ellipse cx="62" cy="65" rx="1.2" ry="3.2" fill="#ffe4d6" />
        {/* Eye shine */}
        <circle cx="59" cy="62.5" r="2" fill="white" opacity="0.8" />
        <circle cx="64" cy="64" r="0.8" fill="white" opacity="0.5" />
      </g>

      <g className="eye-blink">
        <ellipse cx="98" cy="65" rx="6" ry="6.5" fill="#4a3020" />
        <ellipse cx="98" cy="65" rx="3.2" ry="3.8" fill="#1a1a1a" />
        <ellipse cx="98" cy="65" rx="1.2" ry="3.2" fill="#ffe4d6" />
        {/* Eye shine */}
        <circle cx="95" cy="62.5" r="2" fill="white" opacity="0.8" />
        <circle cx="100" cy="64" r="0.8" fill="white" opacity="0.5" />
      </g>

      {/* ── Blush ────────────────────────────────────────── */}
      <ellipse cx="48" cy="78" rx="7" ry="4" fill="#ffb3c6" opacity="0.55" />
      <ellipse cx="112" cy="78" rx="7" ry="4" fill="#ffb3c6" opacity="0.55" />

      {/* ── Nose & mouth ─────────────────────────────────── */}
      <ellipse cx="80" cy="76" rx="2" ry="1.5" fill="#e8a8a8" />
      {/* W mouth */}
      <path d="M74,80 Q77,86 80,82 Q83,86 86,80" stroke="#c97a7a" strokeWidth="1.3" fill="none" strokeLinecap="round" />

      {/* ── Whiskers (catlike energy!) ──────────────────── */}
      <line x1="42" y1="74" x2="22" y2="70" stroke="#ccc" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
      <line x1="42" y1="78" x2="22" y2="78" stroke="#ccc" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
      <line x1="42" y1="82" x2="22" y2="86" stroke="#ccc" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />

      <line x1="118" y1="74" x2="138" y2="70" stroke="#ccc" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
      <line x1="118" y1="78" x2="138" y2="78" stroke="#ccc" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
      <line x1="118" y1="82" x2="138" y2="86" stroke="#ccc" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />

      {/* ── Body (cozy sweater) ──────────────────────────── */}
      <path d="M52,106 Q48,130 54,158 L106,158 Q112,130 108,106 Z" fill="#c4b5fd" />
      {/* Sweater neckline */}
      <path d="M58,106 Q80,98 102,106" stroke="#a78bfa" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* Sweater heart */}
      <path d="M80,132 C76,128 72,132 72,136 C72,141 80,146 80,146 C80,146 88,141 88,136 C88,132 84,128 80,132 Z" fill="#ff8fa3" />

      {/* ── Arms holding book ────────────────────────────── */}
      {/* Left arm */}
      <path d="M56,112 Q40,118 38,130" stroke="#ffe4d6" strokeWidth="8" strokeLinecap="round" fill="none" />
      {/* Right arm */}
      <path d="M104,112 Q120,118 122,130" stroke="#ffe4d6" strokeWidth="8" strokeLinecap="round" fill="none" />

      {/* ── Open book ────────────────────────────────────── */}
      <g transform="translate(52, 124)">
        {/* Book spine */}
        <line x1="28" y1="8" x2="28" y2="28" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" />
        {/* Left page */}
        <path d="M28 8 L28 26 L8 26 Q6 26 4 24 L4 4 Q6 2 8 2 Z" fill="#f5f3ff" stroke="#c4b5fd" strokeWidth="0.8" />
        {/* Right page */}
        <path d="M28 8 L28 26 L48 26 Q50 26 52 24 L52 4 Q50 2 48 2 Z" fill="#ede9fe" stroke="#c4b5fd" strokeWidth="0.8" />
        {/* Text lines on pages */}
        <line x1="7" y1="8" x2="24" y2="8" stroke="#c4b5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.5" />
        <line x1="7" y1="13" x2="22" y2="13" stroke="#c4b5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.5" />
        <line x1="7" y1="18" x2="24" y2="18" stroke="#c4b5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.5" />
        <line x1="7" y1="23" x2="18" y2="23" stroke="#c4b5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.5" />
        <line x1="32" y1="8" x2="49" y2="8" stroke="#c4b5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.5" />
        <line x1="32" y1="13" x2="47" y2="13" stroke="#c4b5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.5" />
        <line x1="32" y1="18" x2="49" y2="18" stroke="#c4b5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.5" />
        <line x1="32" y1="23" x2="45" y2="23" stroke="#c4b5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.5" />
      </g>

      {/* ── Cat tail (curling up behind) ──────────────────── */}
      <g className="tail-group">
        <path
          d="M60,156 Q48,160 40,152 Q32,144 38,136"
          stroke="#2d2d2d"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Tail tip */}
        <circle cx="38" cy="136" r="3" fill="#ffb3c6" />
      </g>
    </svg>
  );
}

const FADE = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function Landing() {
  const navigate = useNavigate();

  return (
    <StudioShell>
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-3xl px-6 sm:px-10 pt-32 sm:pt-40 lg:pt-48 pb-24 text-center overflow-hidden">
        {/* Subtle background ring */}
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                      w-[420px] h-[420px] sm:w-[560px] sm:h-[560px] rounded-full
                      border border-border/40"
        />

        {/* ♡ Cute chibi mascot — floating cat-eared reading girl */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
          className="absolute right-0 sm:right-4 bottom-12 sm:bottom-16 z-10"
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            className="w-28 sm:w-36 drop-shadow-lg"
          >
            <ChibiCatMascot className="w-full h-auto" />
          </motion.div>
          {/* Tiny sparkles around the mascot */}
          <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-accent animate-pulse" strokeWidth={1.5} />
          <Heart className="absolute -bottom-2 -left-1 w-3.5 h-3.5 text-primary animate-pulse" strokeWidth={1.5} />
        </motion.div>

        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.1 } } }}
          className="relative"
        >
          <motion.p
            variants={FADE}
            className="text-sm tracking-[0.2em] text-muted-foreground mb-6"
          >
            EPUB TRANSLATION STUDIO
          </motion.p>

          <motion.h1
            variants={FADE}
            className="text-[40px] sm:text-[56px] lg:text-[72px] font-semibold
                       leading-[1.08] tracking-tight"
          >
            RaynETS
          </motion.h1>

          <motion.p
            variants={FADE}
            className="mt-4 text-lg sm:text-xl text-muted-foreground"
          >
            Translate novels. Right in your browser.
          </motion.p>

          <motion.p
            variants={FADE}
            className="mt-7 text-sm sm:text-base text-muted-foreground max-w-md mx-auto leading-relaxed"
          >
            Drop an EPUB, pick a language, and let DeepSeek or Gemini
            translate your book paragraph by paragraph — then export a
            finished EPUB. Everything stays local.
          </motion.p>

          <motion.div
            variants={FADE}
            className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <button
              onClick={() => navigate("/library")}
              className="h-12 px-8 inline-flex items-center gap-2 bg-foreground
                         text-background hover:opacity-90 rounded-lg text-sm
                         font-medium transition-opacity"
            >
              Open library
              <ArrowRight className="w-4 h-4" strokeWidth={1.6} />
            </button>
            <Link
              to="/how-to-use"
              className="h-12 px-6 inline-flex items-center text-sm
                         text-muted-foreground hover:text-foreground
                         transition-colors"
            >
              How to use →
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Features ──────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 sm:px-10 pb-24 sm:pb-32">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-6">
          {[
            {
              icon: BookOpen,
              title: "EPUB in, EPUB out",
              body: "Upload any .epub — the studio reads its spine, captures every chapter, and writes the finished translation back as a clean EPUB.",
            },
            {
              icon: Globe,
              title: "Two AI engines",
              body: "DeepSeek or Gemini with automatic failover. You control the proxy. Add a glossary and the AI remembers your terms.",
            },
            {
              icon: Shield,
              title: "No cloud, no sign‑up",
              body: "Everything lives in your browser's local storage. No server, no account, no tracking. Your books stay yours.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <div className="w-9 h-9 rounded-lg bg-muted grid place-items-center mb-4">
                <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <h3 className="font-semibold text-sm mb-2">{title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <div className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 sm:px-10 py-6 flex items-center justify-between text-xs text-muted-foreground">
          <a
            href="https://ko-fi.com/raynjee"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground transition-colors"
          >
            Buy me a coffee ☕
          </a>
          <span>Runs entirely in your browser.</span>
        </div>
      </div>
    </StudioShell>
  );
}
