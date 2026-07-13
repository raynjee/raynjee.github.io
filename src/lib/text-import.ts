// Import plain-text and document files (.txt, .docx) and split them into
// chapters using heuristic markers. Produces Book + Chapter[] compatible
// with the same IndexedDB schema the EPUB importer uses.

import JSZip from "jszip";
import type { Chapter } from "./types";
import { countWords } from "./util";

export interface ParsedText {
  title: string;
  author: string;
  description: string;
  language: "auto";
  coverDataUrl: null;
  chapters: Array<Omit<Chapter, "id" | "bookId">>;
}

// ── Entry points ──────────────────────────────────────────────────────────

export async function parseTextFile(file: File): Promise<ParsedText> {
  const text = await file.text();
  return buildParsedText(text, file.name);
}

export async function parseDocxFile(file: File): Promise<ParsedText> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) {
    throw new Error("This .docx file has no word/document.xml — unsupported format.");
  }
  // Extract all <w:t> text nodes (the actual visible text runs).
  const text = extractDocxText(docXml);
  if (!text.trim()) {
    throw new Error("Could not extract any readable text from this .docx file.");
  }
  return buildParsedText(text, file.name);
}

// ── Build parsed result ───────────────────────────────────────────────────

function buildParsedText(raw: string, filename: string): ParsedText {
  const paragraphs = splitParagraphs(raw);
  const chapters = splitIntoChapters(paragraphs, filename);

  return {
    title: filename.replace(/\.(txt|docx?)$/i, ""),
    author: "Unknown",
    description: `Imported from ${filename}`,
    language: "auto",
    coverDataUrl: null,
    chapters,
  };
}

// ── .docx text extraction ─────────────────────────────────────────────────

function extractDocxText(xml: string): string {
  // Match every <w:t>…</w:t> (or <w:t xml:space="preserve">…</w:t>).
  const parts: string[] = [];
  const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    parts.push(m[1]);
  }
  return parts.join("");
}

// ── Paragraph splitting ───────────────────────────────────────────────────

function splitParagraphs(text: string): string[] {
  // Normalize line endings, then split on blank lines (one or more).
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split(/\n{2,}/);
  return lines
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

// ── Chapter detection ─────────────────────────────────────────────────────

const CHAPTER_MARKER_RE = new RegExp(
  [
    // English / European patterns
    "^(?:Chapter|CHAPTER|Ch\\.|Part|Section|Book|Volume|Act|Scene)\\s+\\d+",
    "^(?:Chapter|CHAPTER|Ch\\.|Part|Section|Book|Volume|Act|Scene)\\s+[IVXLCDM]+",
    "^(?:Prologue|Epilogue|PREAMBLE|PROLOGUE|EPILOGUE|Introduction|Foreword|Preface)",
    // Chinese
    "^第[一二三四五六七八九十百千零0-9]+[章节回卷篇部]",
    // Japanese
    "^第[一二三四五六七八九十百千零0-9]+[話章节]",
    // Korean
    "^제[0-9]+[장편절]",
    // Number-only headings (standalone)
    "^\\d+\\.",
    "^\\d+\\)",
    // Roman numeral headings
    "^[IVXLCDM]+\\.",
  ].join("|"),
  "im",
);

function splitIntoChapters(
  paragraphs: string[],
  filename: string,
): Array<Omit<Chapter, "id" | "bookId">> {
  // If the text is short, treat as a single chapter.
  if (paragraphs.length <= 3) {
    return singleChapter(paragraphs, filename);
  }

  // Find chapter boundaries: indices where a paragraph matches the marker.
  const boundaries: number[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (CHAPTER_MARKER_RE.test(paragraphs[i])) {
      boundaries.push(i);
    }
  }

  // If no chapter markers found, try splitting every N paragraphs or treat
  // as single chapter.
  if (boundaries.length === 0) {
    // Try splitting on very long text: every ~80 paragraphs = one chapter.
    if (paragraphs.length > 80) {
      return splitEvenly(paragraphs, filename);
    }
    return singleChapter(paragraphs, filename);
  }

  // Build chapter ranges from boundaries.
  const chapters: Array<Omit<Chapter, "id" | "bookId">> = [];
  let idx = 0;

  // If the first marker isn't at position 0, capture preceding text as a
  // "Front matter" chapter.
  if (boundaries[0] > 0) {
    const preParas = paragraphs.slice(0, boundaries[0]);
    if (preParas.some((p) => p.length > 0)) {
      chapters.push(buildChapter("Front matter", idx, preParas));
      idx++;
    }
  }

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end =
      i + 1 < boundaries.length ? boundaries[i + 1] : paragraphs.length;
    const title = paragraphs[start];
    const body = paragraphs.slice(start + 1, end);
    chapters.push(buildChapter(title, idx, body));
    idx++;
  }

  if (chapters.length === 0) {
    return singleChapter(paragraphs, filename);
  }

  return chapters;
}

function buildChapter(
  title: string,
  index: number,
  body: string[],
): Omit<Chapter, "id" | "bookId"> {
  // Clean the title: strip leading numbers/bullets, cap length.
  let cleanTitle = title.replace(/^[#\d.]+\s*/, "").trim();
  if (cleanTitle.length > 80) cleanTitle = cleanTitle.slice(0, 77) + "…";
  if (!cleanTitle) cleanTitle = `Chapter ${index + 1}`;

  const paragraphs = body.length > 0 ? body : [title];
  const wc = paragraphs.reduce((s, p) => s + countWords(p), 0);

  return {
    title: cleanTitle,
    index,
    html: "", // text imports have no HTML source
    paragraphs,
    wordCount: wc,
  };
}

function singleChapter(
  paragraphs: string[],
  filename: string,
): Array<Omit<Chapter, "id" | "bookId">> {
  if (paragraphs.length === 0) {
    return [
      {
        title: "Chapter 1",
        index: 0,
        html: "",
        paragraphs: ["(Empty document)"],
        wordCount: 2,
      },
    ];
  }
  const wc = paragraphs.reduce((s, p) => s + countWords(p), 0);
  return [
    {
      title: filename.replace(/\.(txt|docx?)$/i, ""),
      index: 0,
      html: "",
      paragraphs,
      wordCount: wc,
    },
  ];
}

function splitEvenly(
  paragraphs: string[],
  filename: string,
): Array<Omit<Chapter, "id" | "bookId">> {
  const chunkSize = Math.ceil(paragraphs.length / Math.ceil(paragraphs.length / 80));
  const chapters: Array<Omit<Chapter, "id" | "bookId">> = [];
  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    const chunk = paragraphs.slice(i, i + chunkSize);
    const wc = chunk.reduce((s, p) => s + countWords(p), 0);
    chapters.push({
      title: `Chapter ${chapters.length + 1}`,
      index: chapters.length,
      html: "",
      paragraphs: chunk,
      wordCount: wc,
    });
  }
  return chapters;
}
