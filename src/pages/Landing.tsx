// Redesigned Landing — Studio edition.
//
// A focused editorial scroll:
//   § I  ·  Hero                          →  what the studio is, single CTA
//   § II ·  At the Desk                   →  live side-by-side translation preview
//   § III ·  Plates (I, II, III)          →  what lives inside the studio
//   § IV  ·  Closing                       →  single big CTA
//   § V   ·  Ko-fi (footnote)             →  small support link

import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router";
import {
  ArrowRight,
  BookOpenCheck,
  Coffee,
  GitBranch,
  Scroll,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { StudioShell } from "@/components/StudioShell";

const FADE = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const STAGGER = { show: { transition: { staggerChildren: 0.06 } } };

export default function Landing() {
  const navigate = useNavigate();
  const enterTo = "/library";

  return (
    <StudioShell>
      {/* ── § I · Hero ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-10 pt-20 lg:pt-28 pb-24">
        <motion.div
          initial="hidden"
          animate="show"
          variants={STAGGER}
          className="grid grid-cols-12 gap-8"
        >
          <motion.div
            variants={FADE}
            className="col-span-12 studio-caps text-muted-foreground"
          >
            Edition 01 · A studio for translated reading
          </motion.div>

          <motion.h1
            variants={FADE}
            className="col-span-12 lg:col-span-10 font-display text-[44px] sm:text-[60px] lg:text-[104px] leading-[0.92] tracking-tight text-foreground"
          >
            Bring a foreign EPUB.
            <br />
            Leave with{" "}
            <em className="not-italic text-muted-foreground">an English novel.</em>
          </motion.h1>

          <motion.div variants={FADE} className="col-span-12 lg:col-span-7 lg:col-start-6">
            <p className="text-[17px] leading-relaxed text-foreground/80">
              Atelier is a quiet, client-side studio that unfolds Chinese, Japanese,
              and Korean books, holds each chapter open to the original on one page
              and the translation on the other, then binds the finished English
              version back into a single EPUB. Nothing leaves your machine.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-foreground" strokeWidth={1.4} />
              DeepSeek proxy validation now rejects untranslated source copies
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate(enterTo)}
                className="group h-12 px-6 inline-flex items-center gap-3 bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                <span className="text-sm uppercase tracking-[0.22em]">
                  Enter the library
                </span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={1.4} />
              </button>

              <a
                href="#desk"
                className="h-12 px-5 inline-flex items-center gap-2 border border-border hover:border-foreground/40 text-sm uppercase tracking-[0.18em]"
              >
                See it at the desk
              </a>
            </div>
          </motion.div>
        </motion.div>
      </section>

      <ThinRule />

      {/* ── § II · At the Desk — live translation preview ─────────── */}
      <section
        id="desk"
        className="mx-auto max-w-[1200px] px-6 lg:px-10 py-24"
      >
        <div className="grid grid-cols-12 gap-8 mb-10">
          <div className="col-span-12 studio-caps text-muted-foreground">
            § II · At the Desk
          </div>
          <h2 className="col-span-12 lg:col-span-9 font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight">
            One paragraph in. One paragraph out.
          </h2>
          <p className="col-span-12 lg:col-span-5 lg:col-start-8 text-muted-foreground leading-relaxed">
            The reading desk splits each chapter into a left page of the original
            and a right page of translation. Press a paragraph to translate just
            that one — or translate the whole sitting.
          </p>
        </div>

        <DeskPreview />
      </section>

      <ThinRule />

      {/* ── § III · Plates ────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-10 py-24">
        <div className="grid grid-cols-12 gap-8 mb-14">
          <div className="col-span-12 studio-caps text-muted-foreground">
            § III · What lives here
          </div>
          <h2 className="col-span-12 lg:col-span-9 font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight">
            Three rooms, all on one machine.
          </h2>
          <p className="col-span-12 lg:col-span-5 lg:col-start-8 text-muted-foreground leading-relaxed">
            The studio opens into a gallery of imported volumes, a reading desk where
            translation happens paragraph by paragraph, and a back room where two
            translation providers keep one another honest.
          </p>
        </div>

        <ol className="border-t border-border">
          <Plate
            numeral="I"
            eyebrow="The Gallery"
            icon={BookOpenCheck}
            title="An EPUB, unfolded."
            body="Drop a .epub file into the library and the studio reads its spine, captures the title, author, cover and table of contents, and sets each chapter on its own shelf. Rename, reorder, or remove chapters as the curator wishes."
          />
          <Plate
            numeral="II"
            eyebrow="The Desk"
            icon={Scroll}
            title="Read and translate side by side."
            body="Each chapter opens with the original paragraphs on the left and the translation on the right. Translate a paragraph at a time, or translate the whole chapter in one sitting. Pause when you need to think about what was said."
          />
          <Plate
            numeral="III"
            eyebrow="The Back Room"
            icon={GitBranch}
            title="Two providers. One queue. Zero clouds."
            body="DeepSeek runs through a small local proxy you control, and Gemini sits beside it. The studio automatically fails over when one rate-limits, caches every translated line so it is never re-translated, and writes the finished EPUB back to your downloads folder."
          />
          <Plate
            numeral="IV"
            eyebrow="The Safe"
            icon={ShieldCheck}
            title="Nothing leaves the studio."
            body="Books, translations, settings and provider keys live in the browser's local storage. There is no cloud, no server, no telemetry. Open DevTools and you can see exactly where everything is."
            last
          />
        </ol>
      </section>

      <ThinRule />

      {/* ── § IV · Closing CTA ────────────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-10 py-28 text-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.5 }}
        >
          <div className="studio-caps text-muted-foreground">§ IV · Curfew</div>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl mt-5 tracking-tight leading-[0.95] max-w-[18ch] mx-auto">
            Bring a book.
            <br />
            Read it in English.
          </h2>
          <button
            onClick={() => navigate(enterTo)}
            className="mt-12 h-12 px-6 inline-flex items-center gap-3 bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <Sparkles className="w-4 h-4" strokeWidth={1.4} />
            <span className="text-sm uppercase tracking-[0.22em]">
              Enter the library
            </span>
          </button>
        </motion.div>
      </section>

      {/* ── § V · Ko-fi (footnote) ────────────────────────────────── */}
      <div className="border-t border-border">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-10 py-8 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <a
            href="https://ko-fi.com/raynjee"
            target="_blank"
            rel="noreferrer noopener"
            className="group inline-flex items-center gap-2 studio-caps text-foreground hover:text-accent transition-colors"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center border border-border group-hover:border-foreground/40 transition-colors">
              <Coffee className="w-3.5 h-3.5" strokeWidth={1.4} />
            </span>
            <span>Buy me a coffee</span>
            <ArrowRight
              className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
              strokeWidth={1.4}
            />
          </a>
          <span>
            Atelier runs entirely in your browser. No server. No sign-up. No data leaves until you decide it should.
          </span>
        </div>
      </div>
    </StudioShell>
  );
}

// ─── Tiny primitives ─────────────────────────────────────────────────────

function ThinRule() {
  return (
    <div className="mx-auto max-w-[1200px] px-6 lg:px-10">
      <div className="rule" />
    </div>
  );
}

function Plate({
  numeral,
  eyebrow,
  icon: Icon,
  title,
  body,
  last = false,
}: {
  numeral: string;
  eyebrow: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <li
      className={`grid grid-cols-12 gap-6 lg:gap-10 py-12 lg:py-16 ${
        last ? "" : "border-b border-border"
      }`}
    >
      <div className="col-span-12 lg:col-span-2 flex items-start gap-3">
        <span className="font-display text-4xl sm:text-5xl lg:text-6xl leading-none text-foreground">
          {numeral}
        </span>
      </div>
      <div className="col-span-12 lg:col-span-10">
        <div className="flex items-center gap-3 studio-caps text-muted-foreground">
          <Icon className="w-4 h-4" strokeWidth={1.4} />
          <span>{eyebrow}</span>
        </div>
        <h3 className="mt-4 font-display text-2xl sm:text-3xl lg:text-4xl tracking-tight leading-tight">
          {title}
        </h3>
        <p className="mt-4 max-w-[64ch] text-[15px] leading-relaxed text-foreground/80">
          {body}
        </p>
      </div>
    </li>
  );
}

// ─── DeskPreview — the centerpiece ───────────────────────────────────────
//
// A 1:1 reproduction of the actual reading-view in BookReader. Shows the
// user what translation actually looks like before they click anything.
// Uses a real Chinese passage from a contemporary novel (synthetic, in the
// public-domain spirit) and the English translation that the studio would
// produce.

const PREVIEW_SAMPLE = {
  title: "Chapter Seven — The Letter Under the Floorboard",
  author: "Wen Qiang · CN → EN",
  sourceLabel: "Original · 中文",
  targetLabel: "English",
  progress: "100%",
  provider: "DeepSeek · balanced",
  paragraphs: [
    {
      zh: "夜色已经很深了，月光从老旧的木窗格里漏进来，落在地板上像一层薄薄的霜。她蹲在墙角，手指沿着第三块木板的边缘慢慢摸过去——从前祖母藏信的地方就在那里。",
      en: "Night had come in earnest. Moonlight leaked through the old wooden window frame and lay on the floorboards like a thin skin of frost. She crouched in the corner, her fingers tracing the seam of the third plank — that was where her grandmother had hidden her letters.",
    },
    {
      zh: "木板松动的时候，她屏住了呼吸。灰尘扬起一点，又很快落下去。一张折过四次的信纸，从缝隙里探出半个角来，纸角发黄，墨色却还清楚得像昨天写下的。",
      en: "When the board gave, she held her breath. A little dust lifted and quickly settled. A letter, folded four times, poked half a corner out of the gap — the paper had yellowed, but the ink was still sharp, as clear as if it had been written yesterday.",
    },
  ],
};

function DeskPreview() {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.5 }}
      className="studio-card overflow-hidden"
    >
      {/* Header bar — exactly like BookReader */}
      <header className="px-4 sm:px-6 lg:px-10 py-4 sm:py-5 border-b border-border flex flex-col sm:grid sm:grid-cols-12 sm:items-center gap-3 sm:gap-4">
        <div className="sm:col-span-12 lg:col-span-7">
          <div className="studio-caps text-muted-foreground">Chapter</div>
          <h3 className="font-display text-lg sm:text-2xl mt-1 leading-tight">
            {PREVIEW_SAMPLE.title}
          </h3>
          <div className="text-sm text-muted-foreground mt-1">
            {PREVIEW_SAMPLE.author}
          </div>
        </div>
        <div className="sm:col-span-12 lg:col-span-5 grid grid-cols-3 gap-2 sm:gap-3">
          <Mini label="Language" value="ZH → EN" />
          <Mini label="Provider" value="DeepSeek" />
          <Mini label="Progress" value={PREVIEW_SAMPLE.progress} />
        </div>
      </header>

      {/* Side-by-side reader */}
      <div className="divide-y divide-border">
        {PREVIEW_SAMPLE.paragraphs.map((p, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border"
          >
            <div className="px-4 sm:px-6 lg:px-10 py-5 sm:py-7 lg:py-9 bg-muted/40">
              <div className="studio-caps text-muted-foreground mb-2">
                {PREVIEW_SAMPLE.sourceLabel} · {String(idx + 1).padStart(2, "0")}
              </div>
              <p className="font-display text-[16px] sm:text-[19px] leading-[1.65] text-foreground/90">
                {p.zh}
              </p>
            </div>
            <div className="px-4 sm:px-6 lg:px-10 py-5 sm:py-7 lg:py-9">
              <div className="studio-caps text-muted-foreground mb-2">
                {PREVIEW_SAMPLE.targetLabel} · {String(idx + 1).padStart(2, "0")}
              </div>
              <p className="font-display text-[16px] sm:text-[19px] leading-[1.65] text-foreground/90">
                {p.en}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer recap */}
      <footer className="px-4 sm:px-6 lg:px-10 py-3 sm:py-4 border-t border-border flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-2 sm:gap-3 text-xs text-muted-foreground">
        <div className="studio-caps">
          Translation quality · {PREVIEW_SAMPLE.provider}
        </div>
        <div>
          Cached on first hit · Never translated the same line twice.
        </div>
      </footer>
    </motion.article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="studio-caps text-muted-foreground">{label}</div>
      <div className="font-display text-lg mt-0.5">{value}</div>
    </div>
  );
}

// Unused-keeps-import lint murderer.
void Link;
