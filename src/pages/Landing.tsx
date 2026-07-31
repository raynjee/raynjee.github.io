// RaynETS — minimalist landing.
// Hero with brand mark → feature cards → footer.

import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router";
import { ArrowRight, BookOpen, Globe, Heart, Shield, Sparkles } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";

const FADE = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function Landing() {
  const navigate = useNavigate();

  return (
    <StudioShell>
      {/* ── Blink animation (two-layer opacity) ─────────── */}
      <style>{`
        .mascot-layer { position: relative; display: inline-block; line-height: 0; }
        .mascot-layer img { width: 100%; height: auto; display: block; }
        .mascot-closed {
          position: absolute; inset: 0;
          opacity: 0;
          animation: blink-eyes 4.5s ease-in-out infinite;
        }
        @keyframes blink-eyes {
          0%, 38%  { opacity: 0; }
          40%      { opacity: 1; }
          44%      { opacity: 1; }
          46%      { opacity: 0; }
          62%      { opacity: 0; }
          64%      { opacity: 1; }
          68%      { opacity: 1; }
          70%      { opacity: 0; }
          100%     { opacity: 0; }
        }
      `}</style>

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-3xl px-6 sm:px-10 pt-32 sm:pt-40 lg:pt-48 pb-24 text-center overflow-hidden">
        {/* Subtle background ring */}
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                      w-[420px] h-[420px] sm:w-[560px] sm:h-[560px] rounded-full
                      border border-border/40"
        />

        {/* ♡ Cute chibi mascot */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
          className="absolute right-0 sm:right-4 bottom-12 sm:bottom-16 z-10"
        >
          <motion.div
            animate={{
              y: [0, -6, 0],
              rotate: [0, 1, 0, -1, 0],
            }}
            transition={{
              y: { duration: 3.5, repeat: Infinity, ease: "easeInOut" },
              rotate: { duration: 5, repeat: Infinity, ease: "easeInOut" },
            }}
            className="w-28 sm:w-36 rounded-xl overflow-hidden drop-shadow-lg"
          >
            <div className="mascot-layer">
              <img
                src="/mascot.png"
                alt="Cute chibi mascot"
                draggable={false}
              />
              <img
                src="/mascot-closed.png"
                alt=""
                className="mascot-closed"
                aria-hidden
                draggable={false}
              />
            </div>
          </motion.div>
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
