// Web novel importer — fetches chapters from web novel sites.
// Fetch chain (tried in order):
//   1. Direct browser fetch  — works if user has "Allow CORS" extension or
//                               the site happens to send CORS headers.
//   2. Jina Reader (r.jina.ai) — free, returns clean markdown, handles most
//                                 Japanese sites perfectly. Blocked by Chinese
//                                 sites that check for data-center IPs.
//   3. Free CORS proxies — last resort, also blocked by aggressive sites.
// Chinese novel sites (69shuba, xbiqige, etc.) use Cloudflare anti-bot
// protection that blocks data-center IPs. Only the user's own browser
// (residential IP) can reliably pass these checks. Install a "CORS bypass"
// browser extension to make direct fetch work for any site.

import type { Book, Chapter } from "./types";

// ── Fetcher layer ──────────────────────────────────────────────────────
// Jina Reader is a purpose-built content extraction service. It fetches any
// URL, strips ads/nav/junk, and returns clean markdown with CORS headers.
// Free tier: generous limits, no API key needed for basic use.
// Format: https://r.jina.ai/{url} → clean markdown text

const JINA_PREFIX = "https://r.jina.ai/";

const FALLBACK_PROXIES = [
  "https://corsproxy.io/?url=",
  "https://api.allorigins.win/raw?url=",
];

const FETCH_TIMEOUT_MS = 15000;

function loadCustomProxy(): string | null {
  if (typeof window === "undefined") return null;
  const val = window.localStorage.getItem("atelier.cors-proxy");
  return val && val.trim() ? val.trim() : null;
}

export function setProxyUrl(url: string | null): void {
  if (typeof window === "undefined") return;
  if (url && url.trim()) {
    window.localStorage.setItem("atelier.cors-proxy", url.trim());
  } else {
    window.localStorage.removeItem("atelier.cors-proxy");
  }
}

export function getProxyUrl(): string {
  return loadCustomProxy() ?? "Jina Reader (r.jina.ai)";
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface FetchedPage {
  /** Raw text content of the page */
  text: string;
  /** Whether the text is clean markdown (Jina) or raw HTML (proxy fallback) */
  format: "markdown" | "html";
}

/** Check if text from Jina Reader is actually an error page. */
function isJinaError(text: string): boolean {
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  return (
    /^Warning:\s/i.test(firstLine) ||
    /error\s\d{3}/i.test(firstLine) ||
    /forbidden/i.test(firstLine) ||
    /target url returned error/i.test(text.slice(0, 200)) ||
    /blocked/i.test(firstLine) ||
    /maybe not yet fully loaded/i.test(text.slice(0, 300))
  );
}

/** Fetch a page using the best available method. */
async function fetchPage(url: string): Promise<FetchedPage> {
  // ── Step 1: Direct browser fetch (your IP, your cookies) ───────
  // Works if you have a CORS-bypass extension installed, or if the
  // target site happens to send permissive CORS headers. This is the
  // only method that passes Cloudflare anti-bot checks on Chinese sites
  // because the request comes from a residential IP with cookies.
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      if (text.trim().length > 200 && !/forbidden|blocked/i.test(text.slice(0, 300))) {
        return { text, format: "html" };
      }
    }
  } catch {
    // CORS blocked — continue to Jina
  }

  // ── Step 2: Jina Reader (clean markdown) ───────────────────────
  try {
    const jinaUrl = JINA_PREFIX + url;
    const res = await fetchWithTimeout(jinaUrl, FETCH_TIMEOUT_MS);
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().length > 50 && !isJinaError(text)) {
        return { text, format: "markdown" };
      }
    }
  } catch {
    // Jina failed — continue to proxies
  }

  // ── Step 3: CORS proxy chain (raw HTML, last resort) ───────────
  const custom = loadCustomProxy();
  const proxies = custom ? [custom, ...FALLBACK_PROXIES] : FALLBACK_PROXIES;
  const errors: string[] = [];

  for (const proxy of proxies) {
    const variants = [proxy + encodeURIComponent(url)];
    if (encodeURIComponent(url) !== url) variants.push(proxy + url);

    for (const proxied of variants) {
      try {
        const res = await fetchWithTimeout(proxied, FETCH_TIMEOUT_MS);
        if (!res.ok) {
          errors.push(`${proxy.slice(0, 35)}… → HTTP ${res.status}`);
          break;
        }
        const buffer = await res.arrayBuffer();
        const head = new TextDecoder("ascii").decode(buffer.slice(0, 2048));
        if (/forbidden|blocked|access denied/i.test(head.slice(0, 200))) {
          errors.push(`${proxy.slice(0, 35)}… → site blocked`);
          break;
        }
        const charsetMatch = /charset[=]["']?\s*([\w-]+)/i.exec(head);
        let charset = "utf-8";
        if (charsetMatch) {
          const c = charsetMatch[1].toLowerCase();
          charset = c === "shift-jis" || c === "shift_jis" ? "shift-jis"
            : c === "gbk" || c === "gb2312" ? "gb18030" : c;
        } else if (/shift.jis/i.test(head)) {
          charset = "shift-jis";
        } else if (/[\u4e00-\u9fff]/.test(head.slice(0, 200))) {
          charset = "gb18030";
        }
        try {
          return { text: new TextDecoder(charset, { fatal: false }).decode(buffer), format: "html" };
        } catch {
          return { text: new TextDecoder("utf-8", { fatal: false }).decode(buffer), format: "html" };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${proxy.slice(0, 35)}… → ${msg.includes("aborted") ? "timeout" : msg.slice(0, 25)}`);
        break;
      }
    }
  }

  // ── All methods failed ─────────────────────────────────────────
  const detail = errors.map((e) => `  • ${e}`).join("\n");
  throw new Error(
    `Can't reach this site. All fetch methods failed.\n\n` +
    `This usually means the site blocks automated requests (Cloudflare\n` +
    `anti-bot, 403 Forbidden). Fix it in 30 seconds:\n\n` +
    `1. Install "Allow CORS" browser extension (Chrome/Firefox)\n` +
    `2. Refresh the page and try importing again\n\n` +
    `The extension lets your browser fetch the page directly with your\n` +
    `own IP and cookies, bypassing all bot detection.\n\n` +
    (detail ? `Technical details:\n${detail}` : ""),
  );
}

// ── Types ────────────────────────────────────────────────────────────────

export interface TocItem {
  title: string;
  url: string; // absolute URL to the chapter page
}

export interface NovelPreview {
  title: string;
  author: string;
  coverUrl: string | null;
  chapters: TocItem[];
  siteLabel: string;
}

export interface ImportProgress {
  phase: "toc" | "chapters";
  done: number;
  total: number;
  currentChapter: string;
}

// ── Helper: resolve relative URLs ───────────────────────────────────────

function resolveUrl(base: URL, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

// ── Markdown-based TOC parser (for Jina Reader output) ──────────────────

function parseTocFromMarkdown(md: string, baseUrl: URL): NovelPreview {
  // Title: first heading or first non-empty line
  const h1 = /^#\s+(.+)$/m.exec(md);
  const title = h1?.[1]?.trim()
    || md.split("\n").find((l) => l.trim().length > 5)?.trim()
    || "Untitled";

  // Author: look for common patterns near the top
  const authorMatch =
    /作者[：:]\s*(.+)/i.exec(md) ||
    /Author[：:]\s*(.+)/i.exec(md) ||
    /著者[：:]\s*(.+)/i.exec(md);
  const author = authorMatch?.[1]?.trim()
    || /by\s+(.+)/im.exec(md.slice(0, 500))?.[1]?.trim()
    || "Unknown";

  // Extract chapter links from markdown: [text](url)
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  const chapters: TocItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(md)) !== null) {
    const text = m[1].trim();
    const href = m[2].trim();
    if (!text || !href || text.length < 2) continue;
    // Filter out non-chapter links
    if (/^(Home|Search|Login|Register|About|Contact|首页|搜索|登录|注册)/i.test(text)) continue;
    if (/^(javascript|mailto|#)/i.test(href)) continue;
    if (href === "/" || href === "#") continue;

    const resolved = resolveUrl(baseUrl, href);
    if (seen.has(resolved)) continue;
    // Chapter links usually have numbers or chapter indicators
    const looksLikeChapter =
      /\d/.test(text) ||
      /第[一二三四五六七八九十百千\d]+[章节回話話]/.test(text) ||
      /chapter|episode|ch\.?\s*\d/i.test(text) ||
      /^(\d+[-.\s])/.test(text) ||
      text.length > 3;
    if (looksLikeChapter) {
      seen.add(resolved);
      chapters.push({ title: text, url: resolved });
    }
  }

  // If markdown links didn't yield enough chapters, try plain-text URL regex
  if (chapters.length === 0) {
    const urlRe = /(https?:\/\/[^\s<>"')\]]+)/g;
    while ((m = urlRe.exec(md)) !== null) {
      const u = m[1];
      if (seen.has(u)) continue;
      // Try to find a nearby label
      const before = md.slice(Math.max(0, m.index - 80), m.index);
      const labelMatch = before.match(/(.{4,40})\s*$/);
      const label = labelMatch?.[1]?.trim() || `Chapter ${chapters.length + 1}`;
      if (/home|search|login|register|about/i.test(label)) continue;
      seen.add(u);
      chapters.push({ title: label, url: u });
    }
  }

  return {
    title: title.length > 120 ? title.slice(0, 117) + "…" : title,
    author,
    coverUrl: null,
    chapters,
    siteLabel: "Jina Reader",
  };
}

// ── HTML-based adapters (CORS proxy fallback) ───────────────────────────

interface SiteAdapter {
  label: string;
  canHandle(url: URL): boolean;
  parseToc(html: string, baseUrl: URL): NovelPreview;
  extractContent(html: string, url: URL): string;
}

function cleanText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const el of doc.querySelectorAll(
    "script, style, nav, iframe, ins, .ad, .ads, .advertisement, [class*=ad-], [id*=ad-], noscript",
  )) el.remove();
  const text = (doc.body || doc).textContent ?? "";
  return text.replace(/[\t\r]/g, "").replace(/\n{3,}/g, "\n\n")
    .split("\n").map((l) => l.trim()).filter((l) => l.length > 0)
    .join("\n\n").trim();
}

const syosetuAdapter: SiteAdapter = {
  label: "Syosetu",
  canHandle(u: URL) { return u.hostname === "ncode.syosetu.com" || u.hostname === "novel18.syosetu.com"; },
  parseToc(html: string, baseUrl: URL): NovelPreview {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = doc.querySelector(".novel_title")?.textContent?.trim() || doc.querySelector("title")?.textContent?.trim() || "Untitled";
    const author = doc.querySelector(".novel_writername a")?.textContent?.trim() || doc.querySelector(".novel_writername")?.textContent?.trim() || "Unknown";
    const links = doc.querySelectorAll<HTMLAnchorElement>(".chapter_title a, .novel_sublist2 dd a, .index_box dd a");
    const chapters: TocItem[] = [];
    for (const a of links) {
      const href = a.getAttribute("href");
      const text = a.textContent?.trim();
      if (href && text) chapters.push({ title: text, url: resolveUrl(baseUrl, href) });
    }
    return { title, author, coverUrl: null, chapters, siteLabel: "Syosetu" };
  },
  extractContent(html: string, _url: URL): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.querySelector("#novel_honbun") || doc.querySelector(".novel_view") || doc.querySelector("#novel_color");
    if (!body) return cleanText(html);
    for (const el of body.querySelectorAll(".novel_bn, .novel_header, .novel_footer")) el.remove();
    return cleanText(body.innerHTML);
  },
};

const kakuyomuAdapter: SiteAdapter = {
  label: "Kakuyomu",
  canHandle(u: URL) { return u.hostname === "kakuyomu.jp"; },
  parseToc(html: string, baseUrl: URL): NovelPreview {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = doc.querySelector("#workTitle")?.textContent?.trim() || doc.querySelector("h1")?.textContent?.trim() || "Untitled";
    const author = doc.querySelector("#workAuthor-activityName a")?.textContent?.trim() || doc.querySelector(".partialGiftWidgetActivityName a")?.textContent?.trim() || "Unknown";
    const links = doc.querySelectorAll<HTMLAnchorElement>(".widget-episodeList a, .widget-toc-items a, .TableOfContents a");
    const chapters: TocItem[] = [];
    for (const a of links) {
      const href = a.getAttribute("href");
      const text = a.textContent?.trim();
      if (href && text && href.includes("/episodes/")) chapters.push({ title: text, url: resolveUrl(baseUrl, href) });
    }
    return { title, author, coverUrl: null, chapters, siteLabel: "Kakuyomu" };
  },
  extractContent(html: string, _url: URL): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.querySelector(".widget-episodeBody") || doc.querySelector(".widget-episode-body");
    if (!body) return cleanText(html);
    return cleanText(body.innerHTML);
  },
};

/** Check if an href looks like a chapter page URL. */
function isChapterUrl(href: string): boolean {
  return /\/(\d+)\.html?$/i.test(href)
    || /\/(\d+)\/?$/i.test(href)
    || /[?&]id=\d+/i.test(href)
    || /\/chapter[/_-]?\d+/i.test(href)
    || /\/read[/_-]?\d+/i.test(href);
}

const genericChineseAdapter: SiteAdapter = {
  label: "Generic",
  canHandle(_u: URL) { return true; },
  parseToc(html: string, baseUrl: URL): NovelPreview {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = doc.querySelector("h1")?.textContent?.trim()
      || doc.querySelector(".book-title")?.textContent?.trim()
      || doc.querySelector(".btitle")?.textContent?.trim()
      || doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim()
      || doc.querySelector("title")?.textContent?.trim()
      || "Untitled";
    const author = doc.querySelector(".author")?.textContent?.trim()
      || doc.querySelector(".writer")?.textContent?.trim()
      || doc.querySelector('meta[property="og:novel:author"]')?.getAttribute("content")?.trim()
      || "Unknown";

    // Phase 1: try known containers first (most accurate)
    const container = doc.querySelector("#list, #chapterlist, .chapterlist, .ml_list, #chapters, .catalog, .mulu, #ulist, .dirlist, #chapters-list, .book-list");
    const scope = container ?? doc.body;
    const allLinks = scope.querySelectorAll<HTMLAnchorElement>("a");

    const chapters: TocItem[] = [];
    const seen = new Set<string>();

    const skipText = /^(首页|书签|排行|搜索|书架|登录|注册|下载|手机版|电脑版|上一页|下一页|返回|加入书签|推荐|收藏|投推荐|打赏|评论|举报|报错)/;
    const skipHref = /^(javascript|mailto|#)/;

    for (const a of allLinks) {
      const href = a.getAttribute("href");
      const text = a.textContent?.trim() ?? "";
      if (!href || skipHref.test(href) || href === "/" || href === "#") continue;
      if (!text || text.length < 1) continue;
      if (skipText.test(text)) continue;
      const resolved = resolveUrl(baseUrl, href);
      if (seen.has(resolved) || seen.has(href)) continue;

      const hasNumber = /\d/.test(text);
      const hasChapterWord = /第[一二三四五六七八九十百千零\d]+[章节回話話節]/i.test(text)
        || /chapter|episode|ch\.?\s*\d|part\s*\d/i.test(text)
        || /^\s*\d+[\s.\-、，,_]/.test(text)
        || /^\s*第\s*\d+/.test(text);
      const isLongEnough = text.length >= 2;

      if ((hasNumber || hasChapterWord || isChapterUrl(href)) && isLongEnough) {
        seen.add(resolved);
        seen.add(href);
        chapters.push({ title: text, url: resolved });
      }
    }

    // Phase 2: if still empty, scan EVERY link on the page with even looser criteria
    if (chapters.length === 0) {
      const allPageLinks = doc.querySelectorAll<HTMLAnchorElement>("a");
      for (const a of allPageLinks) {
        const href = a.getAttribute("href");
        const text = a.textContent?.trim() ?? "";
        if (!href || skipHref.test(href) || href === "/") continue;
        if (skipText.test(text)) continue;
        const resolved = resolveUrl(baseUrl, href);
        if (seen.has(resolved)) continue;
        const sameDomain = (() => {
          try { return new URL(resolved).hostname === baseUrl.hostname; } catch { return false; }
        })();
        if (sameDomain && text.length >= 2 && (isChapterUrl(href) || /\d/.test(text))) {
          seen.add(resolved);
          chapters.push({ title: text, url: resolved });
        }
      }
    }

    return { title, author, coverUrl: null, chapters, siteLabel: "Generic" };
  },
  extractContent(html: string, _url: URL): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.querySelector("#content") || doc.querySelector("#chaptercontent") || doc.querySelector("#BookText") || doc.querySelector("#htmlContent") || doc.querySelector(".content") || doc.querySelector(".showtxt") || doc.querySelector("#nr1") || doc.querySelector(".yd_text2") || doc.querySelector(".article-content");
    if (!body) return cleanText(html);
    for (const el of body.querySelectorAll("script, style, ins, iframe, .ad, .ads, noscript, [class*=ad-], [id*=ad-], .chapter-nav, .page-nav, .read-nav, .bottom-nav, .chapter-control, .bottem, .bottem2, .toplink, [class*=bottom], [class*=footer]")) el.remove();
    return cleanText(body.innerHTML);
  },
};

const adapters: SiteAdapter[] = [syosetuAdapter, kakuyomuAdapter, genericChineseAdapter];

function findAdapter(url: URL): SiteAdapter {
  for (const a of adapters) if (a.canHandle(url)) return a;
  return genericChineseAdapter;
}

// ── Public API ───────────────────────────────────────────────────────────

export async function fetchPreview(url: string): Promise<NovelPreview> {
  const parsed = new URL(url);
  const page = await fetchPage(url);

  if (page.format === "markdown") {
    // Jina Reader returned clean markdown — parse TOC from markdown links
    const preview = parseTocFromMarkdown(page.text, parsed);
    if (preview.chapters.length > 0) return preview;
    // If markdown parsing found nothing, fall through to HTML adapter
  }

  // HTML path (CORS proxy fallback) — use site-specific adapters
  const adapter = findAdapter(parsed);
  return adapter.parseToc(page.text, parsed);
}

export async function fetchChapterContent(chapterUrl: string): Promise<string> {
  const parsed = new URL(chapterUrl);
  const page = await fetchPage(chapterUrl);

  if (page.format === "markdown") {
    // Jina Reader already stripped ads/nav/junk — the markdown IS the story.
    // Remove the Jina header/footer lines ("Title:", "URL Source:", etc.)
    const cleaned = page.text
      .replace(/^Title:.*$/m, "")
      .replace(/^URL Source:.*$/m, "")
      .replace(/^Published Time:.*$/m, "")
      .replace(/^Markdown Content:.*$/m, "")
      .replace(/^={3,}\s*$/gm, "")
      .trim();
    if (cleaned.length > 20) return cleaned;
  }

  // HTML path — use site adapter to extract content
  const adapter = findAdapter(parsed);
  return adapter.extractContent(page.text, parsed);
}

export interface ImportResult {
  book: Omit<Book, "id" | "createdAt" | "updatedAt" | "chapterOrder">;
  chapters: Array<Omit<Chapter, "id" | "bookId">>;
  aborted: boolean;
}

export async function importWebNovel(
  url: string,
  onProgress?: (p: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<ImportResult> {
  onProgress?.({ phase: "toc", done: 0, total: 1, currentChapter: "Fetching table of contents…" });
  const preview = await fetchPreview(url);

  if (signal?.aborted) {
    return { book: { title: "", author: "", description: "", language: "auto", coverDataUrl: null, originalEpub: null }, chapters: [], aborted: true };
  }

  if (preview.chapters.length === 0) {
    throw new Error("Could not find any chapters on this page. Make sure you pasted the novel's main/TOC page URL, not a single chapter URL.");
  }

  onProgress?.({ phase: "toc", done: 1, total: 1, currentChapter: `Found ${preview.chapters.length} chapters` });

  const chapters: Array<Omit<Chapter, "id" | "bookId">> = [];
  let skipped = 0;

  for (let i = 0; i < preview.chapters.length; i++) {
    if (signal?.aborted) {
      return {
        book: { title: preview.title, author: preview.author, description: `Imported from ${preview.siteLabel}: ${url}`, language: "auto", coverDataUrl: preview.coverUrl, originalEpub: null },
        chapters, aborted: true,
      };
    }

    const toc = preview.chapters[i];
    onProgress?.({ phase: "chapters", done: i + 1, total: preview.chapters.length, currentChapter: toc.title });

    try {
      const content = await fetchChapterContent(toc.url);
      if (signal?.aborted) {
        return {
          book: { title: preview.title, author: preview.author, description: `Imported from ${preview.siteLabel}: ${url}`, language: "auto", coverDataUrl: preview.coverUrl, originalEpub: null },
          chapters, aborted: true,
        };
      }

      const paragraphs = content
        .split(/\n{2,}/)
        .flatMap((block) => block.split("\n").filter(Boolean))
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      if (paragraphs.length === 0) { skipped++; continue; }

      const wordCount = paragraphs.reduce((s, p) => s + (p.replace(/\s/g, "").length || p.split(/\s+/).length), 0);

      chapters.push({
        title: toc.title,
        index: chapters.length,
        html: `<p>${paragraphs.map((p) => p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")).join("</p><p>")}</p>`,
        paragraphs,
        wordCount,
      });
    } catch {
      skipped++;
    }

    if (i < preview.chapters.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const language =
    /[\u4e00-\u9fff]/.test(preview.title + chapters.slice(0, 3).map((c) => c.title).join("")) ? "zh"
    : /[\u3040-\u30ff]/.test(preview.title + chapters.slice(0, 3).map((c) => c.title).join("")) ? "ja"
    : "auto";

  return {
    book: {
      title: preview.title,
      author: preview.author,
      description: `Imported from ${preview.siteLabel}: ${url}` + (skipped > 0 ? ` (${skipped} chapters skipped)` : ""),
      language,
      coverDataUrl: preview.coverUrl,
      originalEpub: null,
    },
    chapters,
    aborted: false,
  };
}
