/* Ἀνέκδοτα Bookmarklet — scrape translated chapters from any novel site.
 *
 * One-tap import: bookmark this script, then tap the bookmark on any novel
 * site to grab translated chapters and send them to Ἀνέκδοτα.
 *
 * Installation: see /#/bookmarklet for step-by-step instructions.
 */

(function () {
  if (window.__anekdotaRunning) return;
  window.__anekdotaRunning = true;

  /* ── Tiny UI ─────────────────────────────────────────────────── */
  const css = `
#anekdota-bar{position:fixed;bottom:0;left:0;right:0;z-index:2147483647;
  background:#0a0a0a;color:#f5f5f5;font:13px/1.5 system-ui,sans-serif;
  padding:16px 20px;box-shadow:0 -4px 24px rgba(0,0,0,.6);
  display:flex;align-items:center;justify-content:space-between;gap:16px;
  transition:opacity .2s}
#anekdota-bar .a-status{flex:1;min-width:0}
#anekdota-bar .a-progress{height:3px;background:#333;margin-top:8px;border-radius:2px}
#anekdota-bar .a-progress div{height:100%;background:#f5f5f5;border-radius:2px;transition:width .3s}
#anekdota-bar button{background:#f5f5f5;color:#0a0a0a;border:none;
  padding:8px 18px;border-radius:6px;font:600 12px system-ui,sans-serif;
  cursor:pointer;white-space:nowrap}
#anekdota-bar button:disabled{opacity:.35;cursor:default}
#anekdota-bar button.a-cancel{background:transparent;color:#999;border:1px solid #444}
#anekdota-close{position:absolute;top:8px;right:12px;
  background:none;border:none;color:#666;font-size:18px;cursor:pointer;padding:4px}

@media(max-width:600px){#anekdota-bar{flex-direction:column;align-items:stretch;text-align:center}}
`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const bar = document.createElement("div");
  bar.id = "anekdota-bar";
  bar.innerHTML = `
    <button id="anekdota-close" title="Close">&times;</button>
    <div class="a-status">
      <span id="anekdota-msg">Scanning for chapters…</span>
      <div class="a-progress"><div id="anekdota-fill" style="width:0%"></div></div>
    </div>
    <button id="anekdota-go" disabled>Send to Ἀνέκδοτα</button>
    <button id="anekdota-cancel" class="a-cancel">Cancel</button>
  `;
  document.body.appendChild(bar);

  const msgEl = document.getElementById("anekdota-msg")!;
  const fillEl = document.getElementById("anekdota-fill")!;
  const goBtn = document.getElementById("anekdota-go")! as HTMLButtonElement;

  document.getElementById("anekdota-close")!.onclick = () => {
    bar.style.opacity = "0";
    setTimeout(() => { bar.remove(); style.remove(); }, 300);
    window.__anekdotaRunning = false;
  };
  document.getElementById("anekdota-cancel")!.onclick = () => {
    bar.remove();
    style.remove();
    window.__anekdotaRunning = false;
  };

  function setMsg(text: string, pct?: number) {
    msgEl.textContent = text;
    if (pct != null) fillEl.style.width = pct + "%";
  }

  /* ── Chapter link detection ───────────────────────────────────── */
  function isChapterLink(a: HTMLAnchorElement): boolean {
    const text = (a.textContent || "").trim().toLowerCase();
    const href = (a.getAttribute("href") || "").toLowerCase();

    // Structural hint: if the link is inside a known chapter container, trust it
    const container = a.closest(
      ".chapter-list, .wp-manga-chapter, .listing, .chapters, " +
      ".eplister, .episodes, .series-chapters, .novel-chapters, " +
      ".postlist, .page-listing, ul.lcp_catlist"
    );
    if (container && /\d/.test(text) && text.length >= 1) return true;

    const patterns = [
      /chapter\s*\d+/i, /ch\.?\s*\d+/i, /^c?\d+[\.\-:]/,
      /第[0-9零一二三四五六七八九十百千]+章/, /^[0-9]+[\s\-\.].+/,
      /chapter[-_]\d+/i,  // Lightnovelwp slug: chapter-1
      /vol(\.|ume)?\s*\d+\s*ch(\.|apter)?\s*\d+/i,  // Vol. 1 Ch. 1
      /^\d+[\.\-\s]/,     // Just a number: "1. Title" or "1 - Title"
      /\bchapitre\s*\d+/i, /\bcap[íi]tulo\s*\d+/i,  // French, Spanish
    ];
    const match = patterns.some((p) => p.test(text) || p.test(href));
    if (!match) return false;
    // Exclude links that are clearly not chapters (comments, reviews, etc.)
    const skipWords = ["comment", "review", "about", "contact", "privacy",
      "login", "register", "account", "profile"];
    if (skipWords.some((w) => text.includes(w) || href.includes(w))) return false;
    if (href.startsWith("http") && !href.includes(location.hostname)) return false;
    if (href.startsWith("#")) return false;
    return true;
  }

  function gatherChapterLinks(): HTMLAnchorElement[] {
    const links = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
    const chapters = links.filter(isChapterLink);
    const seen = new Set<string>();
    const unique: HTMLAnchorElement[] = [];
    for (const a of chapters) {
      try {
        const url = new URL(a.href, location.href).href;
        if (!seen.has(url)) {
          seen.add(url);
          unique.push(a);
        }
      } catch {}
    }
    return unique;
  }

  /* ── Detect Cloudflare / bot-protection pages ─────────────────── */
  function isBotProtectionPage(html: string): boolean {
    const lower = html.toLowerCase();
    return (
      lower.includes("just a moment") ||
      lower.includes("checking your browser") ||
      lower.includes("cf-browser-verification") ||
      lower.includes("enable javascript") ||
      lower.includes("please wait") ||
      lower.includes("_cf_chl_opt") ||
      lower.includes("challenge-platform") ||
      lower.includes("turnstile") ||
      lower.includes("recaptcha") ||
      (html.length < 2000 && !lower.includes("<p"))
    );
  }

  /* ── Load chapter via popup (bypasses X-Frame-Options DENY) ────── */
  function fetchViaPopup(url: string, timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
      const win = window.open(url, "_blank", "width=800,height=600");
      if (!win) { resolve(null); return; }

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; try { win.close(); } catch {} resolve(null); }
      }, timeoutMs);

      const check = setInterval(() => {
        if (resolved) { clearInterval(check); return; }
        try {
          if (win.document && win.document.readyState === "complete" && win.document.body) {
            const html = win.document.documentElement.outerHTML;
            if (html.length > 500) {
              clearInterval(check);
              clearTimeout(timeout);
              resolved = true;
              try { win.close(); } catch {}
              resolve(html);
            }
          }
        } catch {
          // Cross-origin popup or not ready yet — keep waiting
        }
      }, 300);

      // Safety: give up after timeoutMs regardless
      setTimeout(() => {
        if (!resolved) { resolved = true; clearInterval(check); try { win.close(); } catch {} resolve(null); }
      }, timeoutMs);
    });
  }

  /* ── Load chapter via hidden iframe (bypasses Cloudflare) ──────── */
  function fetchViaIframe(url: string, timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;border:none";
      iframe.sandbox = null as any;
      iframe.src = url;

      let resolved = false;
      const cleanup = () => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      };

      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; cleanup(); resolve(null); }
      }, timeoutMs);

      iframe.onload = () => {
        if (resolved) return;
        try {
          const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
          if (doc && doc.body) {
            const html = doc.documentElement.outerHTML;
            clearTimeout(timeout);
            resolved = true;
            cleanup();
            resolve(html);
            return;
          }
        } catch (e) {
          // Cross-origin iframe — can't read. Fall through to null.
        }
        if (!resolved) { resolved = true; clearTimeout(timeout); cleanup(); resolve(null); }
      };

      iframe.onerror = () => {
        if (!resolved) { resolved = true; clearTimeout(timeout); cleanup(); resolve(null); }
      };

      document.body.appendChild(iframe);
    });
  }

  /* ── Fetch chapter with adaptive fallback chain ─────────────────── */
  let _fetchFastFailed = false;  // set true after first 403/503

  async function fetchChapter(url: string): Promise<string | null> {
    // If we already know fetch is blocked, skip straight to iframe/popup
    if (!_fetchFastFailed) {
      try {
        const resp = await fetch(url, { credentials: "include" });
        if (resp.ok) {
          const html = await resp.text();
          if (!isBotProtectionPage(html)) return html;
        } else if (resp.status === 403 || resp.status === 503) {
          _fetchFastFailed = true;  // Site blocks fetch — skip for remaining chapters
        }
      } catch {
        // fetch failed entirely — may be a network blip; try iframe first
      }
    }

    // 2. Try hidden iframe (bypasses Cloudflare, works with browser session)
    const iframeHtml = await fetchViaIframe(url, 15000);
    if (iframeHtml && !isBotProtectionPage(iframeHtml)) return iframeHtml;

    // 3. If iframe failed (likely X-Frame-Options DENY), try popup
    return await fetchViaPopup(url, 15000);
  }

  /* ── Content extraction from a chapter page ───────────────────── */
  function extractParagraphs(doc: Document): string[] {
    const candidates: { el: Element; score: number }[] = [];
    const walk = (el: Element) => {
      const tag = el.tagName.toLowerCase();
      if (["script", "style", "nav", "footer", "aside", "header", "noscript", "iframe"].includes(tag))
        return;
      const cls = (el.className || "").toString().toLowerCase();
      const id = (el.id || "").toLowerCase();
      const skipWords = ["comment", "sidebar", "widget", "advertisement", "recommend", "related",
        "nav", "menu", "footer", "header", "breadcrumb", "toolbar", "share"];
      if (skipWords.some((w) => cls.includes(w) || id.includes(w))) return;

      const text = el.textContent || "";
      const len = text.replace(/\s+/g, " ").trim().length;
      const pCount = el.querySelectorAll("p, br").length + 1;
      if (len > 200 && pCount > 3) {
        let score = len;
        if (cls.includes("content") || cls.includes("entry") || cls.includes("chapter") ||
            cls.includes("article") || cls.includes("post") || cls.includes("text") ||
            id.includes("content") || id.includes("chapter") || id.includes("article"))
          score *= 2;
        candidates.push({ el, score });
      }
      for (const child of el.children) walk(child);
    };
    walk(doc.body);

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0]?.el;

    if (!best) {
      return Array.from(doc.querySelectorAll("p"))
        .map((p) => p.textContent?.trim() || "")
        .filter((t) => t.length > 15);
    }

    const paras: string[] = [];
    const collect = (el: Element) => {
      for (const child of el.childNodes) {
        if (child.nodeType === 3) {
          const t = (child.textContent || "").trim();
          if (t.length > 10) paras.push(t);
        } else if (child.nodeType === 1) {
          const e = child as Element;
          const tag = e.tagName.toLowerCase();
          if (tag === "p" || tag === "div" || tag === "li" || tag === "blockquote" || tag === "dd") {
            const t = e.textContent?.trim() || "";
            if (t.length > 10) paras.push(t);
          } else if (tag === "br") {
            // skip
          } else {
            collect(e);
          }
        }
      }
    };
    collect(best);
    if (paras.length === 0) {
      return Array.from(doc.querySelectorAll("p"))
        .map((p) => p.textContent?.trim() || "")
        .filter((t) => t.length > 15);
    }
    return paras;
  }

  /* ── Main flow ────────────────────────────────────────────────── */
  async function run() {
    const links = gatherChapterLinks();
    if (links.length === 0) {
      const title = document.title.replace(/\s*[-–|].*$/, "").trim();
      const paras = extractParagraphs(document);
      if (paras.length === 0) {
        setMsg("No chapters or readable text found on this page. Try a table-of-contents page.");
        return;
      }
      setMsg(`Found 1 chapter · ${paras.length} paragraphs`, 100);
      const data = { chapters: [{ title, paragraphs: paras }], source: location.href };
      enableGo(data);
      return;
    }

    setMsg(`Found ${links.length} chapter links. Fetching…`, 0);

    const chapters: { title: string; paragraphs: string[] }[] = [];
    let ok = 0, fail = 0, popupUsed = 0;

    for (let i = 0; i < links.length; i++) {
      const a = links[i];
      const pct = Math.round((i / links.length) * 100);
      const modeStr = popupUsed > 0 ? ` (popup for ${popupUsed})` : "";
      setMsg(`Fetching chapter ${i + 1} of ${links.length}… (${ok} loaded${modeStr})`, pct);

      try {
        const url = new URL(a.href, location.href).href;
        const html = await fetchChapter(url);
        if (!html) { fail++; continue; }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Check if it's still a protection page (iframe might also fail)
        if (isBotProtectionPage(html)) { fail++; continue; }

        const paras = extractParagraphs(doc);
        if (paras.length === 0) { fail++; continue; }

        const title = a.textContent?.trim() || doc.title.replace(/\s*[-–|].*$/, "").trim() || `Chapter ${i + 1}`;
        chapters.push({ title, paragraphs: paras });
        ok++;
      } catch {
        fail++;
      }

      // Small delay between chapters
      if (i < links.length - 1) await new Promise((r) => setTimeout(r, 300));
    }

    const popupNote = popupUsed > 0 ? ` (${popupUsed} used popup fallback)` : "";
    setMsg(`${ok} chapters ready · ${fail} failed${popupNote}`, 100);

    if (chapters.length === 0) {
      setMsg("Couldn't fetch any chapters. The site may block all requests. Try copy-pasting instead.");
      return;
    }

    const data = { chapters, source: location.href };
    enableGo(data);
  }

  function enableGo(data: { chapters: { title: string; paragraphs: string[] }[]; source: string }) {
    goBtn.disabled = false;
    goBtn.textContent = `Send ${data.chapters.length} chapters`;
    goBtn.onclick = () => {
      try {
        const json = JSON.stringify(data);
        const encoded = btoa(unescape(encodeURIComponent(json)));
        const appUrl = "https://raynjee.github.io";
        const isApp = location.hostname.includes("raynjee.github.io") ||
                      location.hostname === "localhost";
        const base = isApp ? "" : appUrl;
        const target = `${base}/#/import?data=${encoded}`;
        bar.remove();
        style.remove();
        window.__anekdotaRunning = false;
        window.open(target, "_blank");
      } catch (e) {
        setMsg("Data too large. Try scraping fewer chapters.");
        console.error("Bookmarklet error:", e);
      }
    };
  }

  run().catch((e) => {
    setMsg("Error: " + (e.message || "unknown"));
    console.error("Bookmarklet error:", e);
  });
})();
