// Editorial landing page — studio aesthetic. Hero with serif display,
// curated "gallery" wall of placeholder volumes, capability plates,
// curator note, CTA.

import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router";
import {
  ArrowUpRight,
  BookOpenCheck,
  Languages,
  Library as LibraryIcon,
  Brush,
  ArrowRight,
  GitBranch,
  ShieldCheck,
  Scroll,
} from "lucide-react";
import { StudioShell } from "@/components/StudioShell";

const FADE = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const STAGGER = {
  show: { transition: { staggerChildren: 0.07 } },
};

export default function Landing() {
  const navigate = useNavigate();

  const enterLabel = "Enter the library";
  const enterTo = "/library";

  return (
    <StudioShell>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 lg:px-10 pt-12 pb-20 grid grid-cols-12 gap-6 lg:gap-10">
        <motion.div
          initial="hidden"
          animate="show"
          variants={STAGGER}
          className="col-span-12 lg:col-span-7"
        >
          <motion.div variants={FADE} className="studio-caps text-muted-foreground">
            Edition 01 · Curated Translation
          </motion.div>
          <motion.h1
            variants={FADE}
            className="font-display text-[64px] lg:text-[88px] leading-[0.95] tracking-tight mt-4 text-foreground"
          >
            A quiet studio
            <br />
            for translating
            <br />
            <em className="not-italic text-muted-foreground">novels, chapter by chapter.</em>
          </motion.h1>
          <motion.p variants={FADE} className="max-w-[58ch] mt-6 text-[15px] leading-relaxed text-foreground/80">
            Atelier turns EPUB into English. Drop in a Chinese, Japanese or Korean
            volume — we unfold the spine, hold the pages open side by side, and
            translate as you read. When the last chapter turns over, you can
            press the whole finished book back into a single EPUB.
          </motion.p>
          <motion.div variants={FADE} className="mt-10 flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate(enterTo)}
              className="group h-12 px-6 inline-flex items-center gap-3 bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              <span className="text-sm uppercase tracking-[0.22em]">{enterLabel}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={1.4} />
            </button>
            <Link
              to="#gallery"
              className="h-12 px-5 inline-flex items-center gap-2 border border-border hover:border-foreground/40 text-sm uppercase tracking-[0.18em]"
            >
              Walk the gallery
            </Link>
          </motion.div>
          <motion.div variants={FADE} className="mt-12 flex items-center gap-4 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4" strokeWidth={1.4} />
            <span>
              Entirely on your device. Library, translations and settings live in
              your browser. Nothing leaves the studio.
            </span>
          </motion.div>
        </motion.div>

        {/* ── Editorial plate (right) ─────────────────────────────────── */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={STAGGER}
          className="col-span-12 lg:col-span-5 lg:pl-6 lg:border-l lg:border-border"
        >
          <motion.div variants={FADE} className="studio-caps text-muted-foreground">
            Plate I — A note from the curator
          </motion.div>
          <motion.blockquote
            variants={FADE}
            className="font-display italic text-[22px] leading-snug mt-4 text-foreground/90"
          >
            “A library is a workshop; a translation is a piece of furniture
            built in it. Both reward patience, both reward quiet hands.”
          </motion.blockquote>
          <motion.div variants={FADE} className="studio-caps text-muted-foreground mt-3">
            — saberyyang09@gmail.com
          </motion.div>

          <motion.div variants={FADE} className="mt-10 grid grid-cols-2 gap-4">
            <PlateTile
              icon={Languages}
              label="Languages"
              value="04"
              hint="ZH · JA · KO · auto"
            />
            <PlateTile
              icon={LibraryIcon}
              label="Library"
              value="0 / ∞"
              hint="EPUB volumes"
            />
            <PlateTile
              icon={GitBranch}
              label="Providers"
              value="02"
              hint="DeepSeek · Gemini"
            />
            <PlateTile
              icon={Brush}
              label="Theme"
              value="01"
              hint="Gallery Edition"
            />
          </motion.div>
        </motion.div>
      </section>

      <Rule />

      {/* ── Gallery ──────────────────────────────────────────────────── */}
      <section id="gallery" className="mx-auto max-w-[1400px] px-6 lg:px-10 py-20">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="studio-caps text-muted-foreground">Plate II — On the wall</div>
            <h2 className="font-display text-4xl mt-2 tracking-tight">
              A growing shelf, none of it decorative.
            </h2>
            <p className="text-muted-foreground mt-3 max-w-[58ch]">
              Every volume is carried into the studio by the curator. Each
              page is held up to two providers at once so a single outage does
              not break a reading session.
            </p>
          </div>
          <Link
            to={enterTo}
            className="hidden md:inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-foreground hover:text-foreground/70"
          >
            Read the rules <ArrowUpRight className="w-4 h-4" strokeWidth={1.4} />
          </Link>
        </div>
        <div className="mt-10 gallery-grid">
          {GALLERY_BOOKS.map((b, i) => (
            <GalleryTile key={i} {...b} />
          ))}
        </div>
      </section>

      <Rule />

      {/* ── Capabilities ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 lg:px-10 py-20 grid md:grid-cols-3 gap-10">
        <div className="md:col-span-1">
          <div className="studio-caps text-muted-foreground">Plate III — What lives here</div>
          <h2 className="font-display text-4xl mt-2 tracking-tight">
            The studio has three rooms.
          </h2>
          <p className="text-muted-foreground mt-3 leading-relaxed">
            The gallery, the reading desk, and the back room where translators
            work. Every part of the interface is built so you can move from one
            to the next without losing your place.
          </p>
        </div>
        <div className="md:col-span-2 grid sm:grid-cols-2 gap-6">
          <Capability
            icon={BookOpenCheck}
            eyebrow="The Gallery"
            title="A library of EPUBs."
            copy="Drop an EPUB into the library and we unfold it into chapters, capture the title, author, cover and table of contents. Rename, reorder or remove chapters as the curator wishes."
          />
          <Capability
            icon={Scroll}
            eyebrow="The Desk"
            title="Read and translate side by side."
            copy="Each chapter opens with the original paragraphs on the left and the translated paragraphs on the right. Translate a paragraph at a time, or translate the whole chapter in one sitting."
          />
          <Capability
            icon={GitBranch}
            eyebrow="The Back Room"
            title="Two providers, one queue."
            copy="DeepSeek and Gemini work in tandem. The studio automatically fails over when one provider is rate limited, and remembers every translation so the same line is never translated twice."
          />
          <Capability
            icon={ShieldCheck}
            eyebrow="The Safe"
            title="Nothing leaves your machine."
            copy="Books, translations, settings, and API keys live in the browser's local store. There is no cloud, no server, no telemetry — only what you put there."
          />
        </div>
      </section>

      <Rule />

      {/* ── Footer CTA ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 lg:px-10 py-24 text-center">
        <div className="studio-caps text-muted-foreground">Plate IV — Curfew</div>
        <h2 className="font-display text-5xl lg:text-6xl mt-4 tracking-tight max-w-[24ch] mx-auto leading-tight">
          Bring a book.
          <br /> Read it in English.
        </h2>
        <button
          onClick={() => navigate(enterTo)}
          className="mt-10 h-12 px-6 inline-flex items-center gap-3 bg-foreground text-background hover:bg-foreground/90 transition-colors"
        >
          <span className="text-sm uppercase tracking-[0.22em]">{enterLabel}</span>
          <ArrowRight className="w-4 h-4" strokeWidth={1.4} />
        </button>
      </section>
    </StudioShell>
  );
}

function Rule() {
  return <div className="mx-auto max-w-[1400px] px-6 lg:px-10"><div className="rule" /></div>;
}

function PlateTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="studio-card p-5">
      <Icon className="w-5 h-5 text-foreground" strokeWidth={1.4} />
      <div className="studio-caps text-muted-foreground mt-4">{label}</div>
      <div className="font-display text-3xl mt-1">{value}</div>
      <div className="text-xs text-muted-foreground mt-2">{hint}</div>
    </div>
  );
}

function Capability({
  icon: Icon,
  eyebrow,
  title,
  copy,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="studio-card p-6">
      <Icon className="w-6 h-6 text-foreground" strokeWidth={1.4} />
      <div className="studio-caps text-muted-foreground mt-5">{eyebrow}</div>
      <h3 className="font-display text-2xl mt-2 tracking-tight leading-tight">{title}</h3>
      <p className="text-foreground/80 leading-relaxed mt-3 text-sm">{copy}</p>
    </div>
  );
}

const GALLERY_BOOKS = [
  {
    title: "The Long Path",
    author: "Anon · CN",
    tone: "I",
    accent: "from-[#e9e0d1] to-[#cfc4a7]",
  },
  {
    title: "Snow Above the Sea",
    author: "Ayumu Tada · JP",
    tone: "II",
    accent: "from-[#dde2dc] to-[#a9b3a4]",
  },
  {
    title: "Han River, Slowly",
    author: "Yejin Park · KR",
    tone: "III",
    accent: "from-[#e7d8d3] to-[#b89a90]",
  },
  {
    title: "An Atlas of Kites",
    author: "L. He · CN",
    tone: "IV",
    accent: "from-[#dfd9c9] to-[#b8b39c]",
  },
  {
    title: "Letters from Hokkaido",
    author: "S. Kagami · JP",
    tone: "V",
    accent: "from-[#dad8cf] to-[#9ea395]",
  },
  {
    title: "The Cabinet at Busan",
    author: "H. Cho · KR",
    tone: "VI",
    accent: "from-[#e5dccd] to-[#b1a48b]",
  },
  {
    title: "Mourning Recipes",
    author: "Y. Mori · JP",
    tone: "VII",
    accent: "from-[#e3dfce] to-[#a8a489]",
  },
  {
    title: "Twelve Quiet Mornings",
    author: "S.W. Lin · CN",
    tone: "VIII",
    accent: "from-[#dde2db] to-[#aab0a4]",
  },
];

function GalleryTile({
  title,
  author,
  tone,
  accent,
}: {
  title: string;
  author: string;
  tone: string;
  accent: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2 }}
      className="studio-card p-3"
    >
      <div className={`gallery-frame aspect-[3/4] bg-gradient-to-br ${accent}`}>
        <div className="h-full w-full grid place-items-center p-5 text-center">
          <div>
            <div className="studio-caps text-foreground/55">Volume {tone}</div>
            <div className="font-display text-[20px] leading-tight mt-3 text-foreground/85">{title}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-foreground/55 mt-2">{author}</div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <div className="font-display text-sm">{title}</div>
        <div className="studio-num text-[10px] text-muted-foreground">№{tone}</div>
      </div>
    </motion.div>
  );
}
