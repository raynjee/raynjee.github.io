// Safari Reader Mode — localStorage bridge to reader.html.
//
// Safari's "Listen to Page" and auto-advance only work inside Reader Mode.
// Reader Mode only activates on real page loads (not hash-routed SPAs, not
// blob: URLs). We use a standalone /reader.html page served directly by the
// web server (GitHub Pages), which Safari treats as a real article page.
//
// Chapter data is passed via localStorage (same-origin, no network needed).
// The reader.html page reads it on load and renders content server-side
// (into the initial DOM) so Safari's article scanner detects it.
//
// Auto-advance works via <link rel="next"> hash navigation within
// reader.html — Safari's Reader Mode follows the next link when the
// current chapter finishes.

const STORAGE_KEY = "atelier.safariReader";

export interface ReaderChapter {
  title: string;
  paragraphs: string[];
}

export function openSafariReader(
  bookTitle: string,
  chapters: ReaderChapter[],
  startIndex: number,
): void {
  // Store chapter data in localStorage for reader.html to pick up
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ bookTitle, chapters, startIndex }),
    );
  } catch {
    // localStorage may be full — try clearing old data and retry
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ bookTitle, chapters, startIndex }),
      );
    } catch {
      // If still failing, the chapter data is too large.
      // Fall back to blob URL as last resort.
      fallbackBlob(bookTitle, chapters, startIndex);
      return;
    }
  }

  // Open reader.html — a real page that Safari WILL offer Reader Mode on.
  // We append a hash so Safari sees this as a distinct page load per book.
  const readerUrl =
    window.location.origin +
    "/reader.html#chapter=" +
    startIndex;

  const w = window.open(readerUrl, "_blank");
  if (!w) {
    // Popup blocked — navigate in same tab
    window.location.href = readerUrl;
  }
}

/** Last-resort fallback: blob URL when localStorage is unavailable. */
function fallbackBlob(
  bookTitle: string,
  chapters: ReaderChapter[],
  startIndex: number,
): void {
  const chaptersJson = JSON.stringify(chapters).replace(/</g, "\\u003c");
  const startCh = chapters[startIndex];
  const initialContent = startCh
    ? startCh.paragraphs
        .filter((p) => p.trim())
        .map((p) => {
          const esc = p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          if (/^\s*[*·]{2,}\s*$/.test(p) || p === "***" || p === "* * *")
            return '<div class="scene-break">· · ·</div>';
          return "<p>" + esc + "</p>";
        })
        .join("\n")
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(bookTitle)} — Chapter ${startIndex + 1}</title>
<style>
  :root{--bg:#fafaf9;--fg:#1c1917;--fg-dim:#78716c;--fg-softer:#a8a29e;--border:#e7e5e4;--max-w:680px}
  @media(prefers-color-scheme:dark){:root{--bg:#171412;--fg:#e8e4df;--fg-dim:#a8a29e;--fg-softer:#78716c;--border:#2d2824}}
  *{box-sizing:border-box;margin:0;padding:0}
  html{font-size:18px;-webkit-text-size-adjust:100%}
  body{background:var(--bg);color:var(--fg);font-family:Georgia,serif;line-height:1.75;padding:32px 16px 80px;max-width:var(--max-w);margin:0 auto}
  header{margin-bottom:40px;border-bottom:1px solid var(--border);padding-bottom:16px}
  .book-title{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;font-weight:500;color:var(--fg-softer);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
  h1{font-size:28px;font-weight:600;line-height:1.3;letter-spacing:-.01em}
  p{margin-bottom:1.1em;orphans:2;widows:2}
  .scene-break{text-align:center;margin:1.5em 0;color:var(--fg-softer);font-size:14px;letter-spacing:.15em}
  .nav{position:fixed;bottom:0;left:0;right:0;background:var(--bg);border-top:1px solid var(--border);padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;z-index:10}
  .nav button{background:0;border:1px solid var(--border);border-radius:8px;padding:8px 16px;color:var(--fg);cursor:pointer;font-size:14px}
  .nav button:hover{background:var(--border)}
  .nav button:disabled{opacity:.35}
  .nav .location{color:var(--fg-dim);font-size:13px}
  .error-state{text-align:center;padding:48px 16px;color:var(--fg-dim);font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:16px}
</style>
</head>
<body>
<header><div class="book-title">${escHtml(bookTitle)}</div><h1>${escHtml(startCh?.title ?? "—")}</h1></header>
<article>${initialContent}</article>
<nav class="nav">
  <button disabled>← Previous</button>
  <span class="location">Ch. ${startIndex + 1} / ${chapters.length}</span>
  <button${startIndex >= chapters.length - 1 ? " disabled" : ""}>Next →</button>
</nav>
<script>
var chapters=${chaptersJson},bookTitle=${JSON.stringify(bookTitle)},currentIdx=${startIndex};
function esc(s){var d=document.createElement("div");d.appendChild(document.createTextNode(s));return d.innerHTML}
function escAttr(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function renderChapter(i){if(i<0||i>=chapters.length)return;currentIdx=i;var c=chapters[i];document.title=bookTitle+" — Chapter "+(i+1);document.querySelector("h1").textContent=c.title;var h="";for(var j=0;j<c.paragraphs.length;j++){var p=c.paragraphs[j].trim();if(!p)continue;if(p==="***"||p==="* * *"||/^\\s*[*·]{2,}\\s*$/.test(p)){h+='<div class="scene-break">· · ·</div>';continue}h+="<p>"+esc(p)+"</p>"}document.querySelector("article").innerHTML=h;var pb=document.querySelectorAll(".nav button")[0],nb=document.querySelectorAll(".nav button")[1],ll=document.querySelector(".location");ll.textContent="Ch. "+(i+1)+" / "+chapters.length;pb.disabled=i<=0;nb.disabled=i>=chapters.length-1;window.scrollTo({top:0,behavior:"instant"})}
document.querySelectorAll(".nav button")[0].onclick=function(){if(currentIdx>0){window.location.hash="chapter="+(currentIdx-1);renderChapter(currentIdx-1)}};
document.querySelectorAll(".nav button")[1].onclick=function(){if(currentIdx<chapters.length-1){window.location.hash="chapter="+(currentIdx+1);renderChapter(currentIdx+1)}};
window.addEventListener("keydown",function(e){if(e.key==="ArrowRight"&&currentIdx<chapters.length-1){window.location.hash="chapter="+(currentIdx+1);renderChapter(currentIdx+1)}else if(e.key==="ArrowLeft"&&currentIdx>0){window.location.hash="chapter="+(currentIdx-1);renderChapter(currentIdx-1)}});
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 90_000);
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
