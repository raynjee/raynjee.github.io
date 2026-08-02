// RaynETS — minimalist landing.
// Hero with brand mark → feature cards → footer.

import * as React from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router";
import { ArrowRight, BookOpen, Globe, Heart, Shield, Sparkles } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";

const FADE = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

/* ── Seeded random for stable particle positions across re-renders ── */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface Particle {
  id: number;
  left: string;
  top: string;
  size: number;
  dur: string;
  delay: string;
  brightness: number; // 0-1 opacity range
  drift: string;      // gentle horizontal drift
}

function generateParticles(count: number): Particle[] {
  const rng = seededRandom(42);
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const isBright = rng() > 0.75;
    const isTiny = !isBright && rng() > 0.6;
    particles.push({
      id: i,
      left: `${(rng() * 100).toFixed(1)}%`,
      top: `${(rng() * 100).toFixed(1)}%`,
      size: isBright ? 3.5 : isTiny ? 1.5 : 2.5,
      dur: `${(2.5 + rng() * 4).toFixed(1)}s`,
      delay: `${(rng() * 5).toFixed(1)}s`,
      brightness: isBright ? 0.85 : isTiny ? 0.35 : 0.55,
      drift: `${(rng() * 8 - 4).toFixed(1)}px`,
    });
  }
  return particles;
}

const STAR_PARTICLES = generateParticles(35);

/* ── Firefly particles — slow-drifting warm glow dots ── */
interface Firefly {
  id: number;
  startX: string;
  startY: string;
  size: number;
  dur: string;
  delay: string;
  path: { x: number[]; y: number[] }; // keyframe positions
}

function generateFireflies(count: number): Firefly[] {
  const rng = seededRandom(99);
  const fireflies: Firefly[] = [];
  for (let i = 0; i < count; i++) {
    const cx = rng() * 100;
    const cy = rng() * 100;
    // Each firefly wanders in a loose, organic path
    const wander = 80 + rng() * 150;
    const segments = 6;
    const xKeyframes: number[] = [0];
    const yKeyframes: number[] = [0];
    for (let s = 1; s <= segments; s++) {
      xKeyframes.push(xKeyframes[s - 1] + (rng() - 0.5) * wander);
      yKeyframes.push(yKeyframes[s - 1] + (rng() - 0.5) * wander * 0.6);
    }
    // Close the loop back to origin
    xKeyframes.push(0);
    yKeyframes.push(0);
    fireflies.push({
      id: i,
      startX: `${cx.toFixed(1)}%`,
      startY: `${cy.toFixed(1)}%`,
      size: 4 + rng() * 3, // 4-7px — larger than star particles
      dur: `${(18 + rng() * 22).toFixed(0)}s`, // 18-40s — very slow
      delay: `${(rng() * 8).toFixed(1)}s`,
      path: { x: xKeyframes, y: yKeyframes },
    });
  }
  return fireflies;
}

const FIREFLIES = generateFireflies(10);

export default function Landing() {
  const navigate = useNavigate();

  return (
    <StudioShell>
      {/* ── Hero background & mascot decorations ───────────── */}
      <style>{`
        @keyframes moon-glow {
          0%, 100% { box-shadow: 0 0 60px 20px rgba(200,180,255,0.06), inset 0 0 40px 10px rgba(200,180,255,0.03); }
          50%      { box-shadow: 0 0 80px 30px rgba(200,180,255,0.10), inset 0 0 50px 15px rgba(200,180,255,0.05); }
        }
        .moon-circle {
          background: radial-gradient(circle at 35% 35%,
            hsl(var(--background)) 0%,
            hsl(var(--muted) / 0.3) 40%,
            hsl(var(--muted) / 0.08) 70%,
            transparent 100%
          );
          animation: moon-glow 6s ease-in-out infinite;
        }

        /* ── Floating blinking star particles ─────────────── */
        @keyframes star-blink {
          0%, 100% { opacity: 0; transform: scale(0.5) translateX(0); }
          15%      { opacity: var(--star-brightness, 0.55); transform: scale(1) translateX(0); }
          30%      { opacity: var(--star-brightness, 0.55); transform: scale(1) translateX(var(--star-drift, 2px)); }
          50%      { opacity: 0.15; transform: scale(0.7) translateX(var(--star-drift, 2px)); }
          65%      { opacity: var(--star-brightness, 0.55); transform: scale(1.1) translateX(calc(var(--star-drift, 2px) * -0.5)); }
          80%      { opacity: var(--star-brightness, 0.55); transform: scale(1) translateX(0); }
        }
        @keyframes star-glow-pulse {
          0%, 100% { box-shadow: 0 0 3px 1px hsl(var(--foreground) / 0.15); }
          50%      { box-shadow: 0 0 8px 3px hsl(var(--foreground) / 0.3), 0 0 14px 5px hsl(var(--primary) / 0.1); }
        }
        .home-star {
          position: fixed;
          border-radius: 50%;
          background: hsl(var(--foreground) / var(--star-brightness, 0.55));
          pointer-events: none;
          z-index: 0;
          animation:
            star-blink var(--star-dur, 3.5s) ease-in-out var(--star-delay, 0s) infinite,
            star-glow-pulse var(--star-dur, 3.5s) ease-in-out var(--star-delay, 0s) infinite;
        }

        @keyframes sparkle-float {
          0%, 100% { transform: translateY(0) scale(1); opacity: 1; }
          50%      { transform: translateY(-8px) scale(1.3); opacity: 0.6; }
        }
        @keyframes heart-beat {
          0%, 100% { transform: scale(1); }
          15%      { transform: scale(1.25); }
          30%      { transform: scale(1); }
          45%      { transform: scale(1.15); }
          60%      { transform: scale(1); }
        }
        @keyframes float-up {
          0%   { transform: translateY(0) scale(0.5); opacity: 0.8; }
          100% { transform: translateY(-40px) scale(0); opacity: 0; }
        }
        .mascot-sparkle {
          animation: sparkle-float 2s ease-in-out infinite;
        }
        .mascot-sparkle--delayed {
          animation: sparkle-float 2.5s ease-in-out 0.8s infinite;
        }
        .mascot-heart {
          animation: heart-beat 2.2s ease-in-out infinite;
        }
        .mascot-particle {
          position: absolute;
          width: 6px; height: 6px;
          border-radius: 50%;
          animation: float-up 3s ease-out infinite;
        }
        .mascot-particle:nth-child(1) { left: 20%; bottom: 30%; animation-delay: 0s; background: #f9a8d4; }
        .mascot-particle:nth-child(2) { left: 50%; bottom: 40%; animation-delay: 1s; background: #c4b5fd; }
        .mascot-particle:nth-child(3) { left: 75%; bottom: 25%; animation-delay: 2s; background: #fde68a; }

        /* ── Firefly particles — warm drifting glow ─────── */
        @keyframes firefly-glow {
          0%, 100% { opacity: 0.15; filter: blur(0.5px); }
          25%      { opacity: 0.9;  filter: blur(0px);  }
          50%      { opacity: 0.5;  filter: blur(0.3px); }
          75%      { opacity: 0.85; filter: blur(0px);  }
        }
        .firefly {
          position: fixed;
          border-radius: 50%;
          pointer-events: none;
          z-index: 1;
          /* Warm golden glow */
          background: radial-gradient(circle,
            rgba(253, 224, 71, 0.95) 0%,
            rgba(251, 191, 36, 0.6) 40%,
            rgba(251, 191, 36, 0) 70%
          );
          box-shadow:
            0 0 6px 2px rgba(253, 224, 71, 0.5),
            0 0 16px 6px rgba(251, 191, 36, 0.25),
            0 0 30px 10px rgba(251, 191, 36, 0.08);
          animation: firefly-glow var(--ff-glow-dur, 4s) ease-in-out var(--ff-delay, 0s) infinite;
        }
      `}</style>

      {/* ✨ Floating blinking star particles — scattered across the whole page */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
        {STAR_PARTICLES.map((p) => (
          <span
            key={p.id}
            className="home-star"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              '--star-dur': p.dur,
              '--star-delay': p.delay,
              '--star-brightness': p.brightness,
              '--star-drift': p.drift,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* 🪲 Firefly particles — warm drifting glow */}
      {FIREFLIES.map((f) => {
        const keyframes = f.path.x.map((x, i) => ({
          x: f.path.x[i],
          y: f.path.y[i],
        }));
        return (
          <motion.div
            key={`ff-${f.id}`}
            aria-hidden
            className="firefly pointer-events-none"
            style={{
              left: f.startX,
              top: f.startY,
              width: f.size,
              height: f.size,
              '--ff-glow-dur': `${(3 + (f.id % 4))}s`,
              '--ff-delay': f.delay,
            } as React.CSSProperties}
            animate={{
              x: keyframes.map((k) => k.x),
              y: keyframes.map((k) => k.y),
            }}
            transition={{
              x: { duration: parseFloat(f.dur), repeat: Infinity, ease: "linear" },
              y: { duration: parseFloat(f.dur), repeat: Infinity, ease: "linear" },
            }}
          />
        );
      })}

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-3xl px-6 sm:px-10 pt-32 sm:pt-40 lg:pt-48 pb-24 text-center overflow-hidden">
        {/* Moon-like circle — soft ambient glow */}
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                      w-[420px] h-[420px] sm:w-[560px] sm:h-[560px] rounded-full
                      border border-border/20 moon-circle"
        />

        {/* ♡ Cute chibi mascot */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8, type: "spring", bounce: 0.5 }}
          className="absolute right-0 sm:right-4 bottom-12 sm:bottom-16 z-10"
        >
          <motion.div
            animate={{
              y: [0, -8, 0, -4, 0],
              rotate: [0, 2, 0, -2, 0],
            }}
            transition={{
              y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
              rotate: { duration: 6, repeat: Infinity, ease: "easeInOut" },
            }}
            className="w-28 sm:w-36 rounded-xl overflow-hidden drop-shadow-lg"
          >
            {/* GIF animates natively — no blink hacks needed */}
            <img
              src="/mascot.gif"
              alt="Cute chibi mascot reading a book"
              draggable={false}
              className="w-full h-auto block"
            />
          </motion.div>
          {/* Floating sparkle particles */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <span className="mascot-particle" />
            <span className="mascot-particle" />
            <span className="mascot-particle" />
          </div>
          <Sparkles
            className="absolute -top-2 -right-2 w-5 h-5 text-accent mascot-sparkle"
            strokeWidth={1.5}
          />
          <Sparkles
            className="absolute top-1/3 -left-3 w-3.5 h-3.5 text-accent/60 mascot-sparkle--delayed"
            strokeWidth={1.5}
          />
          <Heart
            className="absolute -bottom-2 -left-1 w-4 h-4 text-primary mascot-heart"
            strokeWidth={1.5}
          />
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
      <section className="relative mx-auto max-w-3xl px-6 sm:px-10 pb-24 sm:pb-32">
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
      <div className="border-t border-border relative">
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
