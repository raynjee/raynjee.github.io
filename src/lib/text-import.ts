// Import plain-text and document files (.txt, .docx) and split them into
// chapters using heuristic markers. Produces Book + Chapter[] compatible
// with the same IndexedDB schema the EPUB importer uses.

import JSZip from "jszip";
import type { Chapter } from "./types";
import { countWords } from "./util";

export const SCENE_BREAK = "\x00SCENE_BREAK\x00";

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

const SCENE_BREAK_RE = /^\s*(?:\*[\s*]*\*[\s*]*\*|-[\s-]*-[\s-]*-|~[\s~]*~[\s~]*~|#{3,}|[♦◊※†‡]|(?:(?:\*|–|—)\s?){3,})\s*$/;

function isSceneBreak(line: string): boolean {
  if (SCENE_BREAK_RE.test(line)) return true;
  // Also catch: a line that's only 1-2 decorative chars + optional spaces
  const stripped = line.replace(/\s+/g, "");
  if (/^[♦◊※†‡]{1,3}$/.test(stripped)) return true;
  if (/^\*{3,}$/.test(stripped)) return true;
  if (/^-{3,}$/.test(stripped)) return true;
  if (/^~{3,}$/.test(stripped)) return true;
  return false;
}

function splitParagraphs(text: string): string[] {
  // Normalize line endings, then split on blank lines (one or more).
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const result: string[] = [];

  for (const block of blocks) {
    const cleaned = block.replace(/[^\S\n]+/g, " ").replace(/^\n+|\n+$/g, "").trim();
    if (!cleaned) continue;

    // Scene break detection: if the entire block is a scene break marker,
    // emit the sentinel instead of treating it as a paragraph.
    if (isSceneBreak(cleaned)) {
      result.push(SCENE_BREAK);
      continue;
    }

    // Split into individual lines and clean each one
    const lines = cleaned
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) continue;
    if (lines.length === 1) {
      result.push(lines[0]);
      continue;
    }

    // Group lines intelligently: dialogue stays separate, narrative
    // continuations get joined, headings stay standalone.
    const groups = groupLines(lines);
    for (const group of groups) {
      result.push(group.join("\n"));
    }
  }

  return result;
}

// ── Smart line grouping ───────────────────────────────────────────────────

function isDialogueStart(line: string): boolean {
  // Starts with any quote character or em/en dash (common in fiction)
  return /^["\u201C\u2018\u300C\u300E\u2014\u2015\u2013]/.test(line);
}

function isHeadingLine(line: string): boolean {
  // ALL CAPS and shorter than 60 chars — likely a section header
  return line === line.toUpperCase() && line.length >= 4 && line.length < 60;
}

function endsWithSentenceEnd(line: string): boolean {
  return /[.!?\u201D\u2019\u300D\u300F]\s*$/.test(line);
}

function endsWithContinuation(line: string): boolean {
  // Line ends with comma, semicolon, colon, or no punctuation — continuation
  return !/[.!?]\s*$/.test(line);
}

function groupLines(lines: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [lines[0]];

  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const curr = lines[i];

    // Dialogue line: always starts a new group
    if (isDialogueStart(curr)) {
      if (current.length > 0) groups.push(current);
      current = [curr];
      continue;
    }

    // Previous line was dialogue — break before narrative
    if (isDialogueStart(prev)) {
      groups.push(current);
      current = [curr];
      continue;
    }

    // Heading line: always standalone
    if (isHeadingLine(curr) || isHeadingLine(prev)) {
      if (current.length > 0) groups.push(current);
      current = [curr];
      continue;
    }

    // Short standalone lines (< 30 chars, surrounded by longer lines)
    if (
      curr.length < 30 &&
      prev.length > 40 &&
      i + 1 < lines.length &&
      lines[i + 1].length > 40 &&
      !isDialogueStart(curr)
    ) {
      groups.push(current);
      current = [curr];
      continue;
    }

    // Sentence boundary: prev ends with .!? and curr starts with capital
    if (endsWithSentenceEnd(prev) && /^[A-Z\u0410-\u042F]/.test(curr)) {
      groups.push(current);
      current = [curr];
      continue;
    }

    // Continuation: prev doesn't end with terminal punctuation — join
    // Also join if curr starts with lowercase (mid-sentence continuation)
    if (endsWithContinuation(prev) || /^[a-z]/.test(curr)) {
      current.push(curr);
      continue;
    }

    // Default: start new group (new paragraph)
    groups.push(current);
    current = [curr];
  }

  if (current.length > 0) groups.push(current);
  return groups;
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

export function splitIntoChapters(
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
