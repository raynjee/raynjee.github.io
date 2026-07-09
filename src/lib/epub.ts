// Minimal EPUB parser and writer using JSZip.
// Handles the parts we care about for translation: container.xml,
// OPF (metadata, manifest, spine), and each XHTML chapter file.
// Images, embedded fonts, and complex CSS are preserved (referenced but
// not rewritten) so exported books still look like the originals.

import JSZip from "jszip";
import type { Book, Chapter } from "./types";
import { countWords, uid } from "./util";

export interface ParsedEpub {
  book: Omit<
    Book,
    "originalEpub" | "id" | "createdAt" | "updatedAt" | "chapterOrder"
  >;
  chapters: Array<Omit<Chapter, "id" | "bookId">>;
  blob: Blob;
}

// ── Import ──────────────────────────────────────────────────────────────

export async function parseEpubFile(file: File): Promise<ParsedEpub> {
  if (!/\.epub$/i.test(file.name) && file.type !== "application/epub+zip") {
    throw new Error("Selected file is not an EPUB archive.");
  }
  const blob = file;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());

  const container = await readText(zip, "META-INF/container.xml");
  if (!container) {
    throw new Error("EPUB is missing META-INF/container.xml — not a valid file.");
  }
  const opfPath = extractAttr(container, "rootfile", "full-path");
  if (!opfPath) {
    throw new Error("EPUB container.xml is missing a rootfile reference.");
  }

  const opfXml = await readText(zip, opfPath);
  if (!opfXml) {
    throw new Error(`Could not read OPF at ${opfPath}`);
  }
  const opfDir = opfPath.includes("/")
    ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
    : "";

  const metadata = parseOpfMetadata(opfXml);
  const manifest = parseOpfManifest(opfXml);
  const spine = parseOpfSpine(opfXml);

  const cover = await resolveCover(zip, manifest, opfDir, metadata.coverId);

  const chapters: Array<Omit<Chapter, "id" | "bookId">> = [];
  let idx = 0;
  for (const itemId of spine) {
    const item = manifest[itemId];
    if (!item) continue;
    const href = resolveHref(item.href, opfDir);
    // Accept any XHTML/HTML — by extension OR by declared media-type. JP light
    // novel EPUBs occasionally ship .xht or rely solely on the mimetype.
    const looksHtml =
      /\.(x?html?|xht)$/i.test(href) ||
      /xhtml|html/i.test(item.mediaType ?? "");
    if (!looksHtml) continue;
    const xhtml = await readText(zip, href);
    if (!xhtml) continue;
    const { title, paragraphs } = htmlToParagraphs(xhtml, idx, item.href);
    if (paragraphs.length === 0) continue;
    const wc = paragraphs.reduce((s, p) => s + countWords(p), 0);
    chapters.push({
      title,
      index: idx,
      html: xhtml,
      paragraphs,
      wordCount: wc,
    });
    idx++;
  }

  if (chapters.length === 0) {
    throw new Error("EPUB contained no readable XHTML chapters in its spine.");
  }

  return {
    book: {
      title: metadata.title,
      author: metadata.author,
      description: metadata.description,
      language: (metadata.language as Book["language"]) || "auto",
      coverDataUrl: cover,
    },
    chapters,
    blob,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function readText(
  zip: JSZip,
  path: string,
): Promise<string | null> {
  const f = zip.file(path);
  if (!f) return null;
  return f.async("string");
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]+)"`, "i");
  const m = re.exec(xml);
  return m ? m[1] : null;
}

interface OpfMetadata {
  title: string;
  author: string;
  description: string;
  language: string;
  coverId: string | null;
}

function parseOpfMetadata(opf: string): OpfMetadata {
  const dc = (re: RegExp): string => {
    const m = re.exec(opf);
    return m ? decodeEntities(m[1].trim()) : "";
  };
  const title = dc(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  const author = dc(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
  const description = dc(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);
  const language = dc(/<dc:language[^>]*>([\s\S]*?)<\/dc:language>/i);
  let coverId: string | null = null;
  const cm = /<meta\s+name="cover"\s+content="([^"]+)"/i.exec(opf);
  if (cm) coverId = cm[1];
  return {
    title,
    author,
    description,
    language,
    coverId,
  };
}

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

function parseOpfManifest(opf: string): Record<string, ManifestItem> {
  const out: Record<string, ManifestItem> = {};
  const blockMatch = /<manifest\b[^>]*>([\s\S]*?)<\/manifest>/i.exec(opf);
  const block = blockMatch ? blockMatch[1] : "";
  const itemRe = /<item\b([^/>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(block)) !== null) {
    const attrs = m[1];
    const id = extractAttrFromStr(attrs, "id") ?? uid("item");
    const href = extractAttrFromStr(attrs, "href") ?? "";
    const mediaType = extractAttrFromStr(attrs, "media-type") ?? "";
    const properties = extractAttrFromStr(attrs, "properties") ?? "";
    out[id] = { id, href, mediaType, properties };
  }
  return out;
}

function extractAttrFromStr(s: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}="([^"]+)"`);
  const m = re.exec(s);
  return m ? m[1] : null;
}

function parseOpfSpine(opf: string): string[] {
  const out: string[] = [];
  const blockMatch = /<spine\b[^>]*>([\s\S]*?)<\/spine>/i.exec(opf);
  const block = blockMatch ? blockMatch[1] : "";
  const itemRe = /<itemref\b([^/>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(block)) !== null) {
    const id = extractAttrFromStr(m[1], "idref");
    if (id) out.push(id);
  }
  return out;
}

async function resolveCover(
  zip: JSZip,
  manifest: Record<string, ManifestItem>,
  baseDir: string,
  coverId: string | null,
): Promise<string | null> {
  // Try explicit id, then any item with properties="cover-image"
  let target: ManifestItem | undefined;
  if (coverId) target = manifest[coverId];
  if (!target) {
    target = Object.values(manifest).find(
      (x) => /cover-image/i.test(x.properties) || /cover/i.test(x.id),
    );
  }
  if (!target || !target.href) return null;
  if (!/^image\//i.test(target.mediaType)) return null;
  const path = resolveHref(target.href, baseDir);
  const f = zip.file(path);
  if (!f) return null;
  const buf = await f.async("uint8array");
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${target.mediaType};base64,${btoa(bin)}`;
}

function resolveHref(href: string, baseDir: string): string {
  if (!href) return href;
  // URLs inside zips may be percent-encoded (rare but seen in some
  // publisher-generated EPUBs). Decode defensively before resolving.
  try {
    const decoded = decodeURIComponent(href);
    if (decoded.startsWith("/")) return decoded.slice(1);
    if (!baseDir) return decoded;
    // basic join without URL — EPUBs use forward slashes inside zips
    return baseDir + decoded;
  } catch {
    // Malformed %xx escapes; fall back to the raw href rather than failing.
    if (href.startsWith("/")) return href.slice(1);
    return (baseDir || "") + href;
  }
}

// ── HTML → paragraphs ────────────────────────────────────────────────────

function htmlToParagraphs(
  html: string,
  idx: number,
  href: string,
): { title: string; paragraphs: string[] } {
  const stripped = stripScriptsAndStyles(html);
  // Prefer the lenient text/html parser first; the strict application/xhtml+xml
  // path returns a <parsererror> doc for many JP light-novel EPUBs whose
  // XHTML isn't well-formed (unclosed tags, mixed case, etc.). We only fall
  // back to strict XHTML if the lenient parse returns nothing usable.
  const parser = new DOMParser();
  let doc = parser.parseFromString(stripped, "text/html");
  let root: Element | null =
    (doc.body as Element | null) ?? (doc.documentElement as Element | null);
  if (
    !root ||
    (root.tagName || "").toLowerCase() === "parsererror" ||
    root.querySelector?.("parsererror")
  ) {
    doc = parser.parseFromString(stripped, "application/xhtml+xml");
    root =
      (doc.body as Element | null) ?? (doc.documentElement as Element | null);
  }
  const blocks: string[] = [];
  let titleGuess = "";
  const walker = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (
      [
        "script",
        "style",
        "head",
        "nav",
        "aside",
        "footer",
        "noscript",
        "iframe",
      ].includes(tag)
    ) {
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      const text = el.textContent?.trim() ?? "";
      if (text) {
        blocks.push(text);
        if (!titleGuess) titleGuess = text;
      }
      return;
    }
    if (tag === "p" || tag === "div" || tag === "li" || tag === "blockquote") {
      const text = collapseWhitespace(el.textContent ?? "");
      if (text) blocks.push(text);
      return;
    }
    if (tag === "br") {
      blocks.push("");
      return;
    }
    for (const c of Array.from(el.childNodes)) walker(c);
  };
  if (root) for (const c of Array.from(root.childNodes)) walker(c);
  // Filter empties
  let paragraphs = blocks
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Last-resort regex extraction: some publisher EPUBs wrap every line in
  // <span>s, or use non-standard tags our walker doesn't know about, or
  // ship body content the DOM parser refuses to walk. Pull <p> and <h1–6>
  // blocks straight from the source as a safety net.
  if (paragraphs.length === 0) {
    paragraphs = regexExtractParagraphs(stripped);
  }

  const title =
    titleGuess ||
    (paragraphs[0] ? paragraphs[0].slice(0, 48) : `Chapter ${idx + 1}`);
  const finalTitle = title.length > 80 ? `${title.slice(0, 77)}…` : title;
  void href; // unused
  return { title: finalTitle, paragraphs };
}

// Regex-based paragraph fallback for chapter HTML that the DOM walker
// couldn't make sense of. Pulls <p>…</p> and <h1>…</h1>…<h6>…</h6> blocks,
// strips any nested tags, and collapses whitespace.
function regexExtractParagraphs(s: string): string[] {
  const out: string[] = [];
  const collect = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const inner = (m[2] !== undefined ? m[2] : m[1]) ?? "";
      const text = collapseWhitespace(inner.replace(/<[^>]+>/g, " "));
      if (text) out.push(text);
    }
  };
  collect(/<p\b[^>]*>([\s\S]*?)<\/p>/gi);
  collect(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi);
  return out;
}

function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<head\b[\s\S]*?<\/head>/gi, "");
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

// ── Export ──────────────────────────────────────────────────────────────

export interface ExportOptions {
  book: Book;
  chapters: Chapter[];
  translations: Map<string, (string | null)[]>; // chapterId -> paragraph array
}

export async function buildTranslatedEpub(opts: ExportOptions): Promise<Blob> {
  const zip = new JSZip();
  // mimetype (uncompressed, first file)
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // META-INF
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const itemRefs: { id: string; title: string; href: string }[] = [];

  opts.chapters.forEach((chapter, idx) => {
    const fileId = `chapter_${idx + 1}`;
    const href = `OEBPS/chap_${idx + 1}.xhtml`;
    const translationRows = opts.translations.get(chapter.id) ?? [];
    const paragraphs = chapter.paragraphs.map((p, i) => {
      const t = translationRows[i];
      return t && t.trim().length > 0 ? t : p;
    });
    const title = chapter.title || `Chapter ${idx + 1}`;
    const body = paragraphs
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("\n");
    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>body { font-family: serif; line-height: 1.7; max-width: 38rem; margin: 2rem auto; padding: 0 1rem; } h1 { font-family: serif; text-align: center; margin: 2rem 0; font-weight: 500; } p { margin-bottom: 1em; text-indent: 1.4em; } p:first-child { text-indent: 0; }</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>`;
    zip.file(href, xhtml);
    itemRefs.push({ id: fileId, title, href });
  });

  const manifestItems = itemRefs
    .map(
      (r) =>
        `<item id="${r.id}" href="${r.href.replace(/^OEBPS\//, "")}" media-type="application/xhtml+xml"/>`,
    )
    .join("\n");
  const spineItems = itemRefs
    .map((r) => `<itemref idref="${r.id}"/>`)
    .join("\n");

  const titleEsc = escapeXml(opts.book.title || "Untitled");
  const authorEsc = escapeXml(opts.book.author || "Unknown");
  const descEsc = escapeXml(opts.book.description || "");

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${titleEsc}</dc:title>
<dc:creator>${authorEsc}</dc:creator>
<dc:language>en</dc:language>
<dc:description>${descEsc}</dc:description>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems}
</manifest>
<spine>
${spineItems}
</spine>
</package>`;
  zip.file("OEBPS/content.opf", opf);

  const navEntries = itemRefs
    .map((r) => `<li><a href="${r.href.replace(/^OEBPS\//, "")}">${escapeXml(r.title)}</a></li>`)
    .join("\n");
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body>
<nav epub:type="toc" id="toc">
<h1>Contents</h1>
<ol>
${navEntries}
</ol>
</nav>
</body>
</html>`;
  zip.file("OEBPS/nav.xhtml", nav);

  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeXml(s: string): string {
  return escapeHtml(s);
}
