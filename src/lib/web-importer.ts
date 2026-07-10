// Web novel importer — fetches chapters from web novel sites via a CORS proxy
// and imports them into the library. Each site gets its own adapter that knows
// how to find the table of contents and extract clean story text from chapter
// pages. A generic fallback handles unrecognized Chinese novel sites.

import { uid } from "./util";
import type { Book, Chapter } from "./types";

// ── CORS proxy ─────────────────────────────────────────────────────────
// Free public CORS proxies are unreliable — they go offline, get rate-limited,
// or get blocked by target sites. We try a chain of them with short timeouts.
// If the user runs their own proxy (e.g. a /proxy endpoint on their local
// DeepSeek server at http://127.0.0.1:8001), they can set a custom URL via
// setProxyUrl() or localStorage key "atelier.cors-proxy".
// The custom proxy must accept ?url=<encoded-url> and return the raw page
// body with CORS headers.

const FALLBACK_PROXIES = [
  "https://corsproxy.io/?url=",
  "https://api.allorigins.win/raw?url=",
  "https://cors-anywhere.onrender.com/",
];

const FETCH_TIMEOUT_MS = 8000;

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
  return loadCustomProxy() ?? FALLBACK_PROXIES[0];
}

function buildProxyList(): string[] {
  const custom = loadCustomProxy();
  if (custom) return [custom, ...FALLBACK_PROXIES];
  return FALLBACK_PROXIES;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchViaProxy(url: string): Promise<string> {
  const proxies = buildProxyList();
  const errors: string[] = [];

  for (const proxy of proxies) {
    const proxied = proxy + encodeURIComponent(url);
    try {
      const res = await fetchWithTimeout(proxied, FETCH_TIMEOUT_MS);
      if (!res.ok) {
        errors.push(`${proxy.slice(0, 40)}… → HTTP ${res.status}`);
        continue;
      }
      const buffer = await res.arrayBuffer();
      // Detect charset from meta tag or heuristics
      const head = new TextDecoder("ascii").decode(buffer.slice(0, 2048));
      const charsetMatch = /charset[=]["']?\s*([\w-]+)/i.exec(head);
      const charset = charsetMatch
        ? charsetMatch[1].toLowerCase()
        : /shift.jis/i.test(head)
          ? "shift-jis"
          : /gb|gbk|gb2312/i.test(head) || /[\u4e00-\u9fff]/.test(head.slice(0, 200))
            ? "gb18030"
            : "utf-8";
      const mappedCharset =
        charset === "shift-jis" || charset === "shift_jis"
          ? "shift-jis"
          : charset === "gbk" || charset === "gb2312"
            ? "gb18030"
            : charset;
      try {
        return new TextDecoder(mappedCharset, { fatal: false }).decode(buffer);
      } catch {
        return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const short = msg.includes("aborted") ? "timeout" : msg.slice(0, 40);
      errors.push(`${proxy.slice(0, 40)}… → ${short}`);
      continue;
    }
  }

  // All proxies failed — give the user actionable instructions.
  const detail = errors.map((e) => `  • ${e}`).join("\n");
  throw new Error(
    `All CORS proxies failed. Tried:\n${detail}\n\n` +
      `To fix: run a tiny proxy server on your machine. If you already have\n` +
      `the DeepSeek proxy at http://127.0.0.1:8001, add this endpoint:\n\n` +
      `  GET /proxy?url=<encoded-url>\n` +
      `  → fetch the URL, return the body + header "Access-Control-Allow-Origin: *"\n\n` +
      `Then paste http://127.0.0.1:8001/proxy?url= as your custom proxy in Settings.`,
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

// ── Site adapter interface ──────────────────────────────────────────────

interface SiteAdapter {
  label: string;
  canHandle(url: URL): boolean;
  parseToc(html: string, baseUrl: URL): NovelPreview;
  extractContent(html: string, url: URL): string;
}

// ── Helper: resolve relative URLs ───────────────────────────────────────

function resolveUrl(base: URL, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

// ── Helper: clean chapter content ────────────────────────────────────────

function cleanText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Remove scripts, styles, and common junk elements
  for (const el of doc.querySelectorAll(
    "script, style, nav, iframe, ins, .ad, .ads, .advertisement, [class*=ad-], [id*=ad-], noscript",
  )) {
    el.remove();
  }
  // Get remaining text content, collapse whitespace
  const text = (doc.body || doc).textContent ?? "";
  return text
    .replace(/[\t\r]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n\n")
    .trim();
}

// ── Syosetu adapter (ncode.syosetu.com, novel18.syosetu.com) ──────────

const syosetuAdapter: SiteAdapter = {
  label: "小説家になろう / Syosetu",

  canHandle(url: URL) {
    return (
      url.hostname === "ncode.syosetu.com" ||
      url.hostname === "novel18.syosetu.com"
    );
  },

  parseToc(html: string, baseUrl: URL): NovelPreview {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title =
      doc.querySelector(".novel_title")?.textContent?.trim() ||
      doc.querySelector("title")?.textContent?.trim() ||
      "Untitled";
    const author =
      doc.querySelector(".novel_writername a")?.textContent?.trim() ||
      doc.querySelector(".novel_writername")?.textContent?.trim() ||
      "Unknown";
    // Syosetu TOC: chapters are in .chapter_title > a or .novel_sublist2 > dd > a
    const links = doc.querySelectorAll<HTMLAnchorElement>(
      ".chapter_title a, .novel_sublist2 dd a, .index_box dd a",
    );
    const chapters: TocItem[] = [];
    for (const a of links) {
      const href = a.getAttribute("href");
      const text = a.textContent?.trim();
      if (href && text) {
        chapters.push({ title: text, url: resolveUrl(baseUrl, href) });
      }
    }
    return {
      title,
      author,
      coverUrl: null,
      chapters,
      siteLabel: "Syosetu",
    };
  },

  extractContent(html: string, _url: URL): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body =
      doc.querySelector("#novel_honbun") ||
      doc.querySelector(".novel_view") ||
      doc.querySelector("#novel_color");
    if (!body) return cleanText(html);
    // Remove navigation links and author notes
    for (const el of body.querySelectorAll(
      ".novel_bn, .novel_header, .novel_footer",
    )) {
      el.remove();
    }
    return cleanText(body.innerHTML);
  },
};

// ── Kakuyomu adapter ────────────────────────────────────────────────────

const kakuyomuAdapter: SiteAdapter = {
  label: "カクヨム / Kakuyomu",

  canHandle(url: URL) {
    return url.hostname === "kakuyomu.jp";
  },

  parseToc(html: string, baseUrl: URL): NovelPreview {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title =
      doc.querySelector("#workTitle")?.textContent?.trim() ||
      doc.querySelector("h1")?.textContent?.trim() ||
      "Untitled";
    const author =
      doc.querySelector("#workAuthor-activityName a")?.textContent?.trim() ||
      doc.querySelector(".partialGiftWidgetActivityName a")?.textContent?.trim() ||
      "Unknown";
    // Kakuyomu TOC: episodes are in .widget-episodeList or .widget-toc-items
    const links = doc.querySelectorAll<HTMLAnchorElement>(
      ".widget-episodeList a, .widget-toc-items a, .TableOfContents a",
    );
    const chapters: TocItem[] = [];
    for (const a of links) {
      const href = a.getAttribute("href");
      const text = a.textContent?.trim();
      if (href && text && href.includes("/episodes/")) {
        chapters.push({ title: text, url: resolveUrl(baseUrl, href) });
      }
    }
    return {
      title,
      author,
      coverUrl: null,
      chapters,
      siteLabel: "Kakuyomu",
    };
  },

  extractContent(html: string, _url: URL): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    // Kakuyomu wraps story text in p.jo-episode-body or .widget-episodeBody
    const body =
      doc.querySelector(".widget-episodeBody") ||
      doc.querySelector(".widget-episode-body");
    if (!body) return cleanText(html);
    return cleanText(body.innerHTML);
  },
};

// ── Generic Chinese novel site adapter ──────────────────────────────────
// Most Chinese novel sites use similar CMS templates. This adapter tries
// common selectors and falls back to Readability-like heuristics.

const genericChineseAdapter: SiteAdapter = {
  label: "Chinese Novel Site (generic)",

  canHandle(_url: URL) {
    // This is the fallback adapter — it always returns true but is checked
    // last, after all specific adapters.
    return true;
  },

  parseToc(html: string, baseUrl: URL): NovelPreview {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title =
      doc.querySelector("h1")?.textContent?.trim() ||
      doc.querySelector(".book-title")?.textContent?.trim() ||
      doc.querySelector(".btitle")?.textContent?.trim() ||
      doc.querySelector("title")?.textContent?.trim() ||
      "Untitled";
    const author =
      doc.querySelector(".author")?.textContent?.trim() ||
      doc.querySelector(".writer")?.textContent?.trim() ||
      doc.querySelector('[property="og:novel:author"]')?.getAttribute("content")?.trim() ||
      "Unknown";

    // Try common chapter list containers
    const container =
      doc.querySelector("#list") ||
      doc.querySelector("#chapterlist") ||
      doc.querySelector(".chapterlist") ||
      doc.querySelector(".ml_list") ||
      doc.querySelector("#chapters") ||
      doc.querySelector(".catalog") ||
      doc.querySelector(".mulu") ||
      doc.body;

    // Find all links that look like chapter links (have numbers in href/text)
    const allLinks = container.querySelectorAll<HTMLAnchorElement>("a");
    const chapters: TocItem[] = [];
    const seen = new Set<string>();

    for (const a of allLinks) {
      const href = a.getAttribute("href");
      const text = a.textContent?.trim();
      if (!href || !text || text.length < 2) continue;
      const resolved = resolveUrl(baseUrl, href);
      if (seen.has(resolved)) continue;
      // Filter out obvious non-chapter links
      if (
        /^(首页|书签|排行|搜索|书架|登录|注册|下载|手机版|电脑版|上一页|下一页|返回)/.test(text)
      )
        continue;
      if (
        /^(home|search|login|register|about|contact|index)/i.test(text)
      )
        continue;
      // Chapter links usually have numeric patterns
      const looksLikeChapter =
        /\d/.test(text) ||
        /第[一二三四五六七八九十百千\d]+[章节回]/.test(text) ||
        text.length > 4;
      if (looksLikeChapter) {
        seen.add(resolved);
        chapters.push({ title: text, url: resolved });
      }
    }

    return {
      title,
      author,
      coverUrl: null,
      chapters,
      siteLabel: "Generic",
    };
  },

  extractContent(html: string, _url: URL): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    // Try common content containers
    const body =
      doc.querySelector("#content") ||
      doc.querySelector("#chaptercontent") ||
      doc.querySelector("#BookText") ||
      doc.querySelector("#htmlContent") ||
      doc.querySelector(".content") ||
      doc.querySelector(".showtxt") ||
      doc.querySelector("#nr1") ||
      doc.querySelector(".yd_text2") ||
      doc.querySelector(".article-content");
    if (!body) return cleanText(html);
    // Remove junk elements inside content blocks
    for (const el of body.querySelectorAll(
      "script, style, ins, iframe, .ad, .ads, noscript, " +
        "[class*=ad-], [id*=ad-], .chapter-nav, .page-nav, " +
        ".read-nav, .bottom-nav, .chapter-control, .bottem, " +
        '.bottem2, .toplink, [class*="bottom"], [class*="footer"]',
    )) {
      el.remove();
    }
    return cleanText(body.innerHTML);
  },
};

// ── Adapter registry ────────────────────────────────────────────────────

const adapters: SiteAdapter[] = [
  syosetuAdapter,
  kakuyomuAdapter,
  genericChineseAdapter, // fallback, checked last
];

function findAdapter(url: URL): SiteAdapter {
  for (const a of adapters) {
    if (a.canHandle(url)) return a;
  }
  return genericChineseAdapter;
}

// ── Public API ───────────────────────────────────────────────────────────

export async function fetchPreview(url: string): Promise<NovelPreview> {
  const parsed = new URL(url);
  const adapter = findAdapter(parsed);
  const html = await fetchViaProxy(url);
  return adapter.parseToc(html, parsed);
}

export async function fetchChapterContent(
  chapterUrl: string,
): Promise<string> {
  const parsed = new URL(chapterUrl);
  const adapter = findAdapter(parsed);
  const html = await fetchViaProxy(chapterUrl);
  return adapter.extractContent(html, parsed);
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
  // Phase 1: fetch TOC
  onProgress?.({ phase: "toc", done: 0, total: 1, currentChapter: "Fetching table of contents…" });
  const preview = await fetchPreview(url);

  if (signal?.aborted) {
    return { book: { title: "", author: "", description: "", language: "auto", coverDataUrl: null, originalEpub: null }, chapters: [], aborted: true };
  }

  if (preview.chapters.length === 0) {
    throw new Error(
      "Could not find any chapters on this page. Make sure you pasted the novel's main/TOC page URL, not a single chapter URL.",
    );
  }

  onProgress?.({ phase: "toc", done: 1, total: 1, currentChapter: `Found ${preview.chapters.length} chapters` });

  // Phase 2: fetch chapter contents one by one with rate-limiting delays
  const chapters: Array<Omit<Chapter, "id" | "bookId">> = [];
  let skipped = 0;

  for (let i = 0; i < preview.chapters.length; i++) {
    if (signal?.aborted) {
      return {
        book: {
          title: preview.title,
          author: preview.author,
          description: `Imported from ${preview.siteLabel}: ${url}`,
          language: "auto",
          coverDataUrl: preview.coverUrl,
          originalEpub: null,
        },
        chapters,
        aborted: true,
      };
    }

    const toc = preview.chapters[i];
    onProgress?.({
      phase: "chapters",
      done: i + 1,
      total: preview.chapters.length,
      currentChapter: toc.title,
    });

    try {
      const content = await fetchChapterContent(toc.url);
      if (signal?.aborted) {
        return {
          book: {
            title: preview.title,
            author: preview.author,
            description: `Imported from ${preview.siteLabel}: ${url}`,
            language: "auto",
            coverDataUrl: preview.coverUrl,
            originalEpub: null,
          },
          chapters,
          aborted: true,
        };
      }

      // Split content into paragraphs (double newline or single newline breaks)
      const paragraphs = content
        .split(/\n{2,}/)
        .flatMap((block) => block.split("\n").filter(Boolean))
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      if (paragraphs.length === 0) {
        skipped++;
        continue;
      }

      const wordCount = paragraphs.reduce(
        (s, p) => s + (p.replace(/\s/g, "").length || p.split(/\s+/).length),
        0,
      );

      chapters.push({
        title: toc.title,
        index: chapters.length,
        html: `<p>${paragraphs.map((p) => p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")).join("</p><p>")}</p>`,
        paragraphs,
        wordCount,
      });
    } catch {
      // Skip failed chapters but continue importing the rest
      skipped++;
    }

    // Rate limiting: 1.5s delay between requests
    if (i < preview.chapters.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const language =
    /[\u4e00-\u9fff]/.test(preview.title + chapters.slice(0, 3).map((c) => c.title).join(""))
      ? "zh"
      : /[\u3040-\u30ff]/.test(preview.title + chapters.slice(0, 3).map((c) => c.title).join(""))
        ? "ja"
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
