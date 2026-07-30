// Safari Reader Mode Service Worker
//
// Safari's "Listen to Page" requires stricter semantic structure than
// just "Show Reader" mode. It needs:
//   - <h1> for the article title (not <div>)
//   - <main> landmark for TTS to locate the primary text
//   - OpenGraph meta tags (og:title, og:type)
//   - Clean heading hierarchy (<h1> → <h2> per chapter)
//   - Proper <article> wrapping
//
// Chapter data is pushed from the main app via postMessage. The SW stores
// it in memory and serves it on-demand as a complete, static HTML page.

const STATE = { bookTitle: "", chapters: [], ready: false };

// ── Lifecycle ──────────────────────────────────────────────────────
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Message handler — receive chapter data from the app ───────────
self.addEventListener("message", (event) => {
  const d = event.data;
  if (d && d.type === "SET_READER_CONTENT") {
    STATE.bookTitle = d.bookTitle || "";
    STATE.chapters = d.chapters || [];
    STATE.ready = true;
  }
  if (d && d.type === "CLEAR_READER_CONTENT") {
    STATE.bookTitle = "";
    STATE.chapters = [];
    STATE.ready = false;
  }
});

// ── Fetch handler — serve the reader page with ALL chapters ──────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith("/safari-reader")) return;

  const chapters = STATE.chapters;

  if (!STATE.ready || !chapters.length) {
    event.respondWith(
      new Response(buildErrorPage(STATE.bookTitle), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
    return;
  }

  const html = buildFullBookPage(STATE.bookTitle, chapters);

  event.respondWith(
    new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  );
});

// ── HTML builders ──────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildFullBookPage(bookTitle, chapters) {
  let body = "";
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    body += `<section>\n`;
    body += `<h2>${esc(ch.title)}</h2>\n`;

    for (const p of ch.paragraphs) {
      const t = (p || "").trim();
      if (!t) continue;
      if (t === "***" || t === "* * *" || /^\s*[*\u00B7]{2,}\s*$/.test(t)) {
        body += '<div class="sb">\u00B7 \u00B7 \u00B7</div>\n';
      } else {
        body += "<p>" + esc(t) + "</p>\n";
      }
    }

    body += `</section>\n`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(bookTitle)}</title>
<meta property="og:title" content="${esc(bookTitle)}">
<meta property="og:type" content="article">
<style>
:root{--b:#fafaf9;--f:#1c1917;--fd:#78716c;--fs:#a8a29e;--br:#e7e5e4}
@media(prefers-color-scheme:dark){:root{--b:#171412;--f:#e8e4df;--fd:#a8a29e;--fs:#78716c;--br:#2d2824}}
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:18px;-webkit-text-size-adjust:100%}
body{background:var(--b);color:var(--f);font-family:Georgia,"Times New Roman",serif;line-height:1.75;padding:32px 16px 64px;max-width:680px;margin:0 auto}
h1{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;font-size:14px;font-weight:500;color:var(--fs);text-transform:uppercase;letter-spacing:.08em;margin:0 0 40px;text-align:center}
h2{font-size:22px;font-weight:600;line-height:1.3;letter-spacing:-.01em;margin:48px 0 24px;padding-top:24px;border-top:1px solid var(--br)}
h2:first-of-type{margin-top:0;padding-top:0;border-top:none}
p{margin:0 0 1.1em;orphans:2;widows:2}
.sb{text-align:center;margin:1.5em 0;color:var(--fs);font-size:14px;letter-spacing:.15em}
</style>
</head>
<body>
<main>
<article>
<h1>${esc(bookTitle)}</h1>
${body}
</article>
</main>
</body>
</html>`;
}

function buildErrorPage(bookTitle) {
  const msg = !bookTitle
    ? "No chapter data yet. Open a book and tap Safari Reader again."
    : "Something went wrong. Try reopening Safari Reader from the book.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Reader</title>
<style>
:root{--b:#fafaf9;--f:#1c1917;--fd:#78716c}
@media(prefers-color-scheme:dark){:root{--b:#171412;--f:#e8e4df;--fd:#a8a29e}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--b);color:var(--fd);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px;text-align:center;font-size:16px;line-height:1.6}
small{font-size:13px;opacity:.6}
</style>
</head>
<body>
<div>${esc(msg)}<br><small>Return to the app and try again.</small></div>
</body>
</html>`;
}
