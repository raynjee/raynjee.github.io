// Safari Reader Mode — blob-page builder.
//
// Safari's "Listen to Page" and auto-advance only work inside Reader Mode.
// Reader Mode only activates on real page loads (not hash-routed SPAs).
// So we build a complete, self-contained HTML document, turn it into a
// blob: URL, and open it in a new tab — Safari scans it, offers Reader Mode,
// and auto-advances via <link rel="next"> hash navigation.
//
// The blob embeds ALL chapter content so navigation is instant — no network
// needed. Dark mode is detected via prefers-color-scheme and matches the app
// theme.

export interface ReaderChapter {
  title: string;
  paragraphs: string[];
}

export function buildSafariReaderBlob(
  bookTitle: string,
  chapters: ReaderChapter[],
  startIndex: number,
): string {
  const chaptersJson = JSON.stringify(chapters).replace(/</g, "\\u003c");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<title>${esc(bookTitle)} — Chapter ${startIndex + 1}</title>
<link rel="canonical" href="about:blank">
<link rel="next" href="#chapter=${startIndex + 1}">
${startIndex > 0 ? `<link rel="prev" href="#chapter=${startIndex - 1}">` : ""}
<style>
  :root {
    --bg: #fafaf9;
    --fg: #1c1917;
    --fg-dim: #78716c;
    --fg-softer: #a8a29e;
    --border: #e7e5e4;
    --max-w: 680px;
    --font: "Georgia", "Times New Roman", serif;
    --font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #171412;
      --fg: #e8e4df;
      --fg-dim: #a8a29e;
      --fg-softer: #78716c;
      --border: #2d2824;
    }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 18px; -webkit-text-size-adjust: 100%; }
  body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font);
    line-height: 1.75;
    padding: 32px 16px 64px;
    max-width: var(--max-w);
    margin: 0 auto;
  }
  header { margin-bottom: 40px; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
  .book-title {
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 500;
    color: var(--fg-softer);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8px;
  }
  h1 {
    font-size: 28px;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }
  article { margin-top: 8px; }
  p {
    margin-bottom: 1.1em;
    text-indent: 0;
    orphans: 2;
    widows: 2;
  }
  p:first-of-type { margin-top: 0; }
  .nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--bg);
    border-top: 1px solid var(--border);
    padding: 10px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-ui);
    font-size: 14px;
    z-index: 10;
  }
  .nav button, .nav a {
    background: none;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 16px;
    color: var(--fg);
    cursor: pointer;
    font-size: 14px;
    font-family: var(--font-ui);
    text-decoration: none;
    transition: background 0.15s, border-color 0.15s;
  }
  .nav button:hover, .nav a:hover { background: var(--border); }
  .nav button:disabled, .nav a.disabled { opacity: 0.35; pointer-events: none; }
  .nav .location { color: var(--fg-dim); font-size: 13px; }
  .scene-break {
    text-align: center;
    margin: 1.5em 0;
    color: var(--fg-softer);
    font-size: 14px;
    letter-spacing: 0.15em;
  }
  .spacer { height: 56px; }
</style>
</head>
<body>
<header>
  <div class="book-title">${esc(bookTitle)}</div>
  <h1 id="chapterTitle">${esc(chapters[startIndex]?.title ?? "—")}</h1>
</header>
<article id="content"></article>
<div class="spacer"></div>
<nav class="nav">
  <button id="prevBtn" disabled>&larr; Previous</button>
  <span class="location" id="locationLabel"></span>
  <button id="nextBtn" disabled>Next &rarr;</button>
</nav>
<script>
  var chapters = ${chaptersJson};
  var currentIdx = ${startIndex};
  var bookTitle = ${JSON.stringify(bookTitle)};

  function esc(s) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  function renderChapter(idx) {
    if (idx < 0 || idx >= chapters.length) return;
    currentIdx = idx;
    var ch = chapters[idx];

    // Update title
    document.title = bookTitle + " — Chapter " + (idx + 1);
    document.getElementById("chapterTitle").textContent = ch.title;

    // Build content
    var html = "";
    for (var i = 0; i < ch.paragraphs.length; i++) {
      var p = ch.paragraphs[i].trim();
      if (!p) continue;

      // Scene break detection
      if (p === "***" || p === "* * *" || /^[\\u{2009}\\u{2003}\\u{00A0}\\s]*\\*[\\u{2009}\\u{2003}\\u{00A0}\\s]*\\*[\\u{2009}\\u{2003}\\u{00A0}\\s]*\\*[\\u{2009}\\u{2003}\\u{00A0}\\s]*$/u.test(p) || /^\\s*[*\\u00B7]{2,}\\s*$/.test(p)) {
        html += '<div class="scene-break">\u00B7 \u00B7 \u00B7</div>';
        continue;
      }

      html += "<p>" + esc(p) + "</p>";
    }
    document.getElementById("content").innerHTML = html;

    // Update nav links
    var prevBtn = document.getElementById("prevBtn");
    var nextBtn = document.getElementById("nextBtn");
    var locLabel = document.getElementById("locationLabel");

    locLabel.textContent = "Ch. " + (idx + 1) + " / " + chapters.length;

    // Update <link> tags for Reader Mode auto-advance
    var links = document.head.querySelectorAll('link[rel="next"], link[rel="prev"]');
    for (var j = 0; j < links.length; j++) links[j].remove();

    if (idx < chapters.length - 1) {
      var nextLink = document.createElement("link");
      nextLink.rel = "next";
      nextLink.href = "#chapter=" + (idx + 1);
      document.head.appendChild(nextLink);
      nextBtn.disabled = false;
      nextBtn.className = "";
      nextBtn.onclick = function() { navigateTo(idx + 1); };
    } else {
      nextBtn.disabled = true;
      nextBtn.className = "disabled";
    }

    if (idx > 0) {
      var prevLink = document.createElement("link");
      prevLink.rel = "prev";
      prevLink.href = "#chapter=" + (idx - 1);
      document.head.appendChild(prevLink);
      prevBtn.disabled = false;
      prevBtn.className = "";
      prevBtn.onclick = function() { navigateTo(idx - 1); };
    } else {
      prevBtn.disabled = true;
      prevBtn.className = "disabled";
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function navigateTo(idx) {
    if (idx < 0 || idx >= chapters.length) return;
    window.location.hash = "chapter=" + idx;
    renderChapter(idx);
  }

  // Handle hash changes (Reader Mode follows <link rel="next"> as hash navigation)
  function onHashChange() {
    var h = window.location.hash;
    var m = h.match(/^#chapter=(\\d+)$/);
    if (m) {
      var idx = parseInt(m[1], 10);
      if (idx >= 0 && idx < chapters.length) {
        renderChapter(idx);
      }
    }
  }

  window.addEventListener("hashchange", onHashChange);

  // Handle keyboard navigation
  window.addEventListener("keydown", function(e) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      if (currentIdx < chapters.length - 1) navigateTo(currentIdx + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      if (currentIdx > 0) navigateTo(currentIdx - 1);
    }
  });

  // Initial render
  renderChapter(currentIdx);
</script>
</body>
</html>`;

  return html;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function openSafariReader(
  bookTitle: string,
  chapters: ReaderChapter[],
  startIndex: number,
): void {
  const html = buildSafariReaderBlob(bookTitle, chapters, startIndex);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  // Open in a new tab — Safari will detect the article and offer Reader Mode
  const w = window.open(url, "_blank");
  if (!w) {
    // Popup blocked — fall back to same-tab navigation
    window.location.href = url;
  }

  // Clean up the blob URL after the page loads (optional, browser GC handles it too)
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
