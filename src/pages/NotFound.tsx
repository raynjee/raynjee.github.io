// Instructions + FAQ — a beginner-friendly guide to using Ἀνέκδοτα.
// Replaces the old 404 page.

import { useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { BookOpen, Download, Sparkles, Cloud, HelpCircle, ChevronDown } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";

export default function NotFound() {
  return (
    <StudioShell>
      <div className="mx-auto max-w-[900px] px-6 lg:px-10 pt-10 pb-20">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">How to use Ἀνέκδοτα</h1>
        <p className="text-muted-foreground mt-2 text-sm max-w-[60ch]">
          A quiet EPUB-to-EPUB translation studio. Upload a novel, translate it
          with AI, and download the finished book — all from your browser.
        </p>

        <div className="mt-10 space-y-16">
          {/* ── Getting started ──────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold mb-6">Getting started</h2>
            <div className="space-y-8">
              <Step num={1} title="Upload your book">
                <p className="text-sm text-muted-foreground">
                  Go to the{" "}
                  <Link to="/library" className="underline hover:text-foreground">
                    Library
                  </Link>{" "}
                  and drag an .epub file onto the page, or click the upload button.
                  Your book's chapters are automatically extracted and listed.
                </p>
              </Step>

              <Step num={2} title="Set up a translator">
                <p className="text-sm text-muted-foreground">
                  Ἀνέκδοτα uses AI to translate. You have two choices:
                </p>
                <ul className="mt-2 space-y-2 text-sm text-muted-foreground list-disc list-inside ml-4">
                  <li>
                    <strong className="text-foreground">DeepSeek</strong> — free
                    unlimited translations via a local proxy. Requires running a
                    small Python script on your computer.{" "}
                    <Link to="/settings" className="underline hover:text-foreground">
                      Setup guide in Settings
                    </Link>
                    .
                  </li>
                  <li>
                    <strong className="text-foreground">Gemini</strong> — Google's
                    AI. Needs a free API key from{" "}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      Google AI Studio
                    </a>
                    . Paste it in Settings.
                  </li>
                </ul>
              </Step>

              <Step num={3} title="Translate">
                <p className="text-sm text-muted-foreground">
                  Open a book, pick a chapter, and click{" "}
                  <strong className="text-foreground">Translate</strong>. Progress
                  is saved as each paragraph completes. Click{" "}
                  <strong className="text-foreground">Translate all</strong> to
                  process every chapter at once.
                </p>
              </Step>

              <Step num={4} title="Export">
                <p className="text-sm text-muted-foreground">
                  When translation is done, click{" "}
                  <strong className="text-foreground">Export EPUB</strong>. You
                  get a new .epub with your translated text, ready to read on any
                  device.
                </p>
              </Step>

              <Step num={5} title="Sync across devices">
                <p className="text-sm text-muted-foreground">
                  Use the{" "}
                  <Link to="/settings" className="underline hover:text-foreground">
                    Google Drive sync
                  </Link>{" "}
                  in Settings. Push from one device, pull on another — all your
                  books, translations, and reading progress stay in sync.
                </p>
              </Step>
            </div>
          </section>

          {/* ── FAQ ──────────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold mb-6">FAQ</h2>
            <div className="space-y-2">
              <FaqItem
                question="Is Ἀνέκδοτα free?"
                answer="Yes — completely. Translations happen on your machine using your own API keys or local proxy. We don't charge anything."
              />
              <FaqItem
                question="Do I need to know coding to use it?"
                answer="Not at all. If you use DeepSeek, you'll need to run a Python script (instructions provided). For Gemini, just paste an API key — that's it."
              />
              <FaqItem
                question="What languages can I translate from?"
                answer="Chinese, Japanese, Korean, and English. Auto-detection works if your book mixes languages between chapters."
              />
              <FaqItem
                question="Are my books stored on a server?"
                answer="No. Everything stays in your browser's local storage. No accounts, no cloud storage — unless you opt into Google Drive sync for cross-device backup."
              />
              <FaqItem
                question="Can I edit a translation?"
                answer="Yes. Click the pencil icon while reading any chapter to enter edit mode. You can also re-translate individual paragraphs by clicking the retranslate button next to each one."
              />
              <FaqItem
                question="What is a glossary and why use it?"
                answer="A glossary is a list of terms with their preferred translations (e.g. character names, locations). Add entries and the AI will use them consistently across all chapters."
              />
              <FaqItem
                question="Why am I seeing random Chinese characters in the English translation?"
                answer="Make sure your glossary entries don't contain untranslated terms. Also, DeepSeek may occasionally leave source text — use the paragraph re-translate button to fix individual lines."
              />
              <FaqItem
                question="Can I read the book aloud?"
                answer="Yes — click the speaker icon in any chapter. The browser's built-in text-to-speech reads the translated text. On Edge or Chrome, high-quality natural voices are available."
              />
              <FaqItem
                question="How do I get my books on another device?"
                answer="Set up Google Drive sync in Settings (one-time, ~3 minutes). Then click Connect on your other device and Pull — everything appears."
              />
            </div>
          </section>

          {/* ── Still stuck? ────────────────────────────────── */}
          <div className="rounded-xl border border-border/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Something not covered here? Head to{" "}
              <Link to="/settings" className="underline hover:text-foreground">
                Settings
              </Link>{" "}
              for the detailed setup guide, or visit the{" "}
              <Link to="/library" className="underline hover:text-foreground">
                Library
              </Link>{" "}
              to get started.
            </p>
          </div>
        </div>
      </div>
    </StudioShell>
  );
}

// ── Step component ────────────────────────────────────────────────────

function Step({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-semibold mt-0.5">
        {num}
      </span>
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

// ── FAQ accordion ─────────────────────────────────────────────────────

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="text-sm font-medium">{question}</span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={1.25}
        />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="px-4 pb-4"
        >
          <p className="text-sm text-muted-foreground leading-relaxed">{answer}</p>
        </motion.div>
      )}
    </div>
  );
}
