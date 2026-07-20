/* ImportTranslations — receives scraped chapter data from the bookmarklet
 * and matches it to a book's raw chapters for one-click importing.
 *
 * The bookmarklet sends data via URL hash: /#/import?data=<base64json>
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Loader2,
  X,
  ChevronDown,
  Bookmark,
  Globe,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { StudioShell } from "@/components/StudioShell";
import { useLibrary, saveTranslation } from "@/hooks/use-library";
import { listChapters } from "@/lib/db";
import type { Chapter, ChapterTranslation } from "@/lib/types";
import { SCENE_BREAK } from "@/lib/text-import";
import { cn } from "@/lib/utils";

interface ScrapedChapter {
  title: string;
  paragraphs: string[];
}

interface ImportData {
  chapters: ScrapedChapter[];
  source: string;
}

// Self-contained bookmarklet — no external script loading.
// Best for: Safari (iOS/macOS), Firefox (Android/Desktop) — works even on sites with strict CSP.
// Minified from public/bookmarklet.js — edit that file and re-minify to update this.
const BOOKMARKLET_FULL = `javascript:(function (){if (window.__anekdotaRunning)return;window.__anekdotaRunning=true;const css=\` #anekdota-bar{position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#0a0a0a;color:#f5f5f5;font:13px/1.5 system-ui,sans-serif;padding:16px 20px;box-shadow:0-4px 24px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:space-between;gap:16px;transition:opacity .2s}#anekdota-bar .a-status{flex:1;min-width:0}#anekdota-bar .a-progress{height:3px;background:#333;margin-top:8px;border-radius:2px}#anekdota-bar .a-progress div{height:100%;background:#f5f5f5;border-radius:2px;transition:width .3s}#anekdota-bar button{background:#f5f5f5;color:#0a0a0a;border:none;padding:8px 18px;border-radius:6px;font:600 12px system-ui,sans-serif;cursor:pointer;white-space:nowrap}#anekdota-bar button:disabled{opacity:.35;cursor:default}#anekdota-bar button.a-cancel{background:transparent;color:#999;border:1px solid #444}#anekdota-close{position:absolute;top:8px;right:12px;background:none;border:none;color:#666;font-size:18px;cursor:pointer;padding:4px}@media(max-width:600px){#anekdota-bar{flex-direction:column;align-items:stretch;text-align:center}}\`;const style=document.createElement(\"style\");style.textContent=css;document.head.appendChild(style);const bar=document.createElement(\"div\");bar.id=\"anekdota-bar\";bar.innerHTML=\`<button id=\\\"anekdota-close\\\" title=\\\"Close\\\">&times;</button><div class=\\\"a-status\\\"><span id=\\\"anekdota-msg\\\">Scanning for chapters…</span><div class=\\\"a-progress\\\"><div id=\\\"anekdota-fill\\\" style=\\\"width:0%\\\"></div></div></div><button id=\\\"anekdota-go\\\" disabled>Send to Ἀνέκδοτα</button><button id=\\\"anekdota-cancel\\\" class=\\\"a-cancel\\\">Cancel</button>\`;document.body.appendChild(bar);const msgEl=document.getElementById(\"anekdota-msg\")!;const fillEl=document.getElementById(\"anekdota-fill\")!;const goBtn=document.getElementById(\"anekdota-go\")! as HTMLButtonElement;document.getElementById(\"anekdota-close\")!.onclick=()=>{bar.style.opacity=\"0\";setTimeout(()=>{bar.remove();style.remove();},300);window.__anekdotaRunning=false;};document.getElementById(\"anekdota-cancel\")!.onclick=()=>{bar.remove();style.remove();window.__anekdotaRunning=false;};function setMsg(text:string,pct?:number){msgEl.textContent=text;if (pct !=null)fillEl.style.width=pct+\"%\";}function isChapterLink(a:HTMLAnchorElement):boolean{const text=(a.textContent||\"\").trim().toLowerCase();const href=(a.getAttribute(\"href\")||\"\").toLowerCase();const patterns=[ /chapter\\s*\\d+/i,/ch\\.?\\s*\\d+/i,/^c?\\d+[\\.\\-:]/,/第[0-9零一二三四五六七八九十百千]+章/,/^[0-9]+[\\s\\-\\.].+/,];const match=patterns.some((p)=>p.test(text)||p.test(href));if (!match)return false;if (text.length<3&&!/\\d/.test(text))return false;if (href.startsWith(\"http\")&&!href.includes(location.hostname))return false;if (href.startsWith(\"#\"))return false;return true;}function gatherChapterLinks():HTMLAnchorElement[]{const links=Array.from(document.querySelectorAll(\"a[href]\"))as HTMLAnchorElement[];const chapters=links.filter(isChapterLink);const seen=new Set<string>();const unique:HTMLAnchorElement[]=[];for (const a of chapters){try{const url=new URL(a.href,location.href).href;if (!seen.has(url)){seen.add(url);unique.push(a);}} catch{}}return unique;}function isBotProtectionPage(html:string):boolean{const lower=html.toLowerCase();return (lower.includes(\"just a moment\")||lower.includes(\"checking your browser\")||lower.includes(\"cf-browser-verification\")||lower.includes(\"enable javascript\")||lower.includes(\"please wait\")||lower.includes(\"_cf_chl_opt\")||lower.includes(\"challenge-platform\")||lower.includes(\"turnstile\")||lower.includes(\"recaptcha\")||(html.length<2000&&!lower.includes(\"<p\")));}function fetchViaIframe(url:string,timeoutMs:number):Promise<string | null>{return new Promise((resolve)=>{const iframe=document.createElement(\"iframe\");iframe.style.cssText=\"position:absolute;left:-9999px;width:1px;height:1px;border:none\";iframe.sandbox=null as any;iframe.src=url;let resolved=false;const cleanup=()=>{if (iframe.parentNode)iframe.parentNode.removeChild(iframe);};const timeout=setTimeout(()=>{if (!resolved){resolved=true;cleanup();resolve(null);}},timeoutMs);iframe.onload=()=>{if (resolved)return;try{const doc=iframe.contentDocument||(iframe.contentWindow&&iframe.contentWindow.document);if (doc&&doc.body){const html=doc.documentElement.outerHTML;clearTimeout(timeout);resolved=true;cleanup();resolve(html);return;}} catch (e){}if (!resolved){resolved=true;clearTimeout(timeout);cleanup();resolve(null);}};iframe.onerror=()=>{if (!resolved){resolved=true;clearTimeout(timeout);cleanup();resolve(null);}};document.body.appendChild(iframe);});}async function fetchChapter(url:string):Promise<string | null>{try{const resp=await fetch(url,{credentials:\"include\"});if (resp.ok){const html=await resp.text();if (!isBotProtectionPage(html))return html;}} catch{}return await fetchViaIframe(url,15000);}function extractParagraphs(doc:Document):string[]{const candidates:{el:Element;score:number}[]=[];const walk=(el:Element)=>{const tag=el.tagName.toLowerCase();if ([\"script\",\"style\",\"nav\",\"footer\",\"aside\",\"header\",\"noscript\",\"iframe\"].includes(tag))return;const cls=(el.className||\"\").toString().toLowerCase();const id=(el.id||\"\").toLowerCase();const skipWords=[\"comment\",\"sidebar\",\"widget\",\"advertisement\",\"recommend\",\"related\",\"nav\",\"menu\",\"footer\",\"header\",\"breadcrumb\",\"toolbar\",\"share\"];if (skipWords.some((w)=>cls.includes(w)||id.includes(w)))return;const text=el.textContent||\"\";const len=text.replace(/\\s+/g,\" \").trim().length;const pCount=el.querySelectorAll(\"p,br\").length+1;if (len>200&&pCount>3){let score=len;if (cls.includes(\"content\")||cls.includes(\"entry\")||cls.includes(\"chapter\")||cls.includes(\"article\")||cls.includes(\"post\")||cls.includes(\"text\")||id.includes(\"content\")||id.includes(\"chapter\")||id.includes(\"article\"))score *=2;candidates.push({el,score});}for (const child of el.children)walk(child);};walk(doc.body);candidates.sort((a,b)=>b.score-a.score);const best=candidates[0]?.el;if (!best){return Array.from(doc.querySelectorAll(\"p\")).map((p)=>p.textContent?.trim()||\"\").filter((t)=>t.length>15);}const paras:string[]=[];const collect=(el:Element)=>{for (const child of el.childNodes){if (child.nodeType===3){const t=(child.textContent||\"\").trim();if (t.length>10)paras.push(t);} else if (child.nodeType===1){const e=child as Element;const tag=e.tagName.toLowerCase();if (tag===\"p\"||tag===\"div\"||tag===\"li\"||tag===\"blockquote\"||tag===\"dd\"){const t=e.textContent?.trim()||\"\";if (t.length>10)paras.push(t);} else if (tag===\"br\"){}else{collect(e);}}}};collect(best);if (paras.length===0){return Array.from(doc.querySelectorAll(\"p\")).map((p)=>p.textContent?.trim()||\"\").filter((t)=>t.length>15);}return paras;}async function run(){const links=gatherChapterLinks();if (links.length===0){const title=document.title.replace(/\\s*[-–|].*$/,\"\").trim();const paras=extractParagraphs(document);if (paras.length===0){setMsg(\"No chapters or readable text found on this page. Try a table-of-contents page.\");return;}setMsg(\`Found 1 chapter · \${paras.length}paragraphs\`,100);const data={chapters:[{title,paragraphs:paras}],source:location.href};enableGo(data);return;}setMsg(\`Found \${links.length}chapter links. Fetching…\`,0);const chapters:{title:string;paragraphs:string[]}[]=[];let ok=0,fail=0,iframeUsed=0;for (let i=0;i<links.length;i++){const a=links[i];const pct=Math.round((i / links.length)* 100);const modeStr=iframeUsed>0 ? \`(iframe for \${iframeUsed})\`:\"\";setMsg(\`Fetching chapter \${i+1}of \${links.length}…(\${ok}loaded\${modeStr})\`,pct);try{const url=new URL(a.href,location.href).href;const html=await fetchChapter(url);if (!html){fail++;continue;}const parser=new DOMParser();const doc=parser.parseFromString(html,\"text/html\");if (isBotProtectionPage(html)){fail++;continue;}const paras=extractParagraphs(doc);if (paras.length===0){fail++;continue;}const title=a.textContent?.trim()||doc.title.replace(/\\s*[-–|].*$/,\"\").trim()||\`Chapter \${i+1}\`;chapters.push({title,paragraphs:paras});ok++;} catch{fail++;}if (i<links.length-1)await new Promise((r)=>setTimeout(r,300));}const iframeNote=iframeUsed>0 ? \`(\${iframeUsed}used iframe fallback)\`:\"\";setMsg(\`\${ok}chapters ready · \${fail}failed\${iframeNote}\`,100);if (chapters.length===0){setMsg(\"Couldn't fetch any chapters. The site may block all requests. Try copy-pasting instead.\");return;}const data={chapters,source:location.href};enableGo(data);}function enableGo(data:{chapters:{title:string;paragraphs:string[]}[];source:string}){goBtn.disabled=false;goBtn.textContent=\`Send \${data.chapters.length}chapters\`;goBtn.onclick=()=>{try{const json=JSON.stringify(data);const encoded=btoa(unescape(encodeURIComponent(json)));const appUrl=\"https://raynjee.github.io\";const isApp=location.hostname.includes(\"raynjee.github.io\")||location.hostname===\"localhost\";const base=isApp ? \"\":appUrl;const target=\`\${base}/#/import?data=\${encoded}\`;bar.remove();style.remove();window.__anekdotaRunning=false;window.open(target,\"_blank\");} catch (e){setMsg(\"Data too large. Try scraping fewer chapters.\");console.error(\"Bookmarklet error:\",e);}};}run().catch ((e)=>{setMsg(\"Error:\"+(e.message||\"unknown\"));console.error(\"Bookmarklet error:\",e);});})()`;

// Short bootstrap bookmarklet — only ~80 chars, avoids Edge/Chrome's javascript:-length limit.
// Loads the full script via fetch() + eval(). Use this on Edge and Chrome mobile.
const BOOKMARKLET_BOOTSTRAP = `javascript:fetch('https://raynjee.github.io/bookmarklet.js').then(r=>r.text()).then(eval)`;

export default function ImportTranslationsPage() {
  const navigate = useNavigate();
  const { books, refresh } = useLibrary();
  const [data, setData] = useState<ImportData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Parse data from URL on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
      const raw = params.get("data");
      if (!raw) {
        setLoading(false);
        return;
      }
      const json = decodeURIComponent(escape(atob(raw)));
      const parsed = JSON.parse(json) as ImportData;
      if (!parsed.chapters?.length) {
        setError("No chapters found in the import data.");
        setLoading(false);
        return;
      }
      setData(parsed);
      setLoading(false);
    } catch (e) {
      setError("Could not decode import data. It may be corrupt or too large.");
      setLoading(false);
    }
  }, []);

  // Selected book + starting chapter index
  const [selectedBookId, setSelectedBookId] = useState("");
  const [startChapterIdx, setStartChapterIdx] = useState(0);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);

  // Load chapters for the selected book
  const [rawChapters, setRawChapters] = useState<Chapter[]>([]);
  const selectedBook = books.find((b) => b.id === selectedBookId);

  useEffect(() => {
    if (!selectedBookId) { setRawChapters([]); return; }
    listChapters(selectedBookId).then((list) => {
      const book = books.find((b) => b.id === selectedBookId);
      if (!book) { setRawChapters(list); return; }
      setRawChapters(book.chapterOrder.map((id) => list.find((c) => c.id === id)).filter((x): x is Chapter => !!x));
    });
  }, [selectedBookId, books]);

  // Match preview: show which scraped chapters map to which raw chapters
  const matchPreview = useMemo(() => {
    if (!data || rawChapters.length === 0) return [];
    const preview: { scrapedIdx: number; scrapedTitle: string; paras: number;
      rawTitle: string | null; rawParas: number | null; match: "ok" | "mismatch" | "no-raw" }[] = [];
    for (let i = 0; i < data.chapters.length; i++) {
      const rawIdx = startChapterIdx + i;
      const raw = rawChapters[rawIdx];
      const scraped = data.chapters[i];
      preview.push({
        scrapedIdx: i,
        scrapedTitle: scraped.title,
        paras: scraped.paragraphs.length,
        rawTitle: raw?.title ?? null,
        rawParas: raw?.paragraphs.filter((p) => p !== SCENE_BREAK && p.trim()).length ?? null,
        match: !raw ? "no-raw"
          : Math.abs(scraped.paragraphs.length - (raw.paragraphs.filter((p) => p !== SCENE_BREAK && p.trim()).length)) <= 3
          ? "ok" : "mismatch",
      });
    }
    return preview;
  }, [data, rawChapters, startChapterIdx]);

  const onImport = useCallback(async () => {
    if (!data || !selectedBookId || rawChapters.length === 0) return;
    setImporting(true);
    let count = 0;
    for (let i = 0; i < data.chapters.length; i++) {
      const rawIdx = startChapterIdx + i;
      const raw = rawChapters[rawIdx];
      if (!raw) break;
      const scraped = data.chapters[i];
      const paragraphs: (string | null)[] = raw.paragraphs.map((p, pi) => {
        if (p === SCENE_BREAK) return null;
        const sIdx = raw.paragraphs.slice(0, pi).filter((x) => x !== SCENE_BREAK).length;
        const translation = scraped.paragraphs[sIdx]?.trim();
        return translation && translation !== p.trim() ? translation : null;
      });
      const tr: ChapterTranslation = {
        id: `${selectedBookId}:${raw.id}`,
        bookId: selectedBookId,
        chapterId: raw.id,
        paragraphs,
        status: paragraphs.some((p) => p) ? "completed" : "idle",
        provider: "manual",
        progress: paragraphs.filter((p) => p).length / Math.max(1, paragraphs.length),
        completedAt: Date.now(),
      };
      try {
        await saveTranslation(tr);
        count++;
        setImported(count);
      } catch (e) {
        toast.error(`Failed to save chapter "${raw.title}": ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
    setImporting(false);
    await refresh();
    toast.success(`Imported ${count} chapter${count !== 1 ? "s" : ""}.`);
    navigate("/library");
  }, [data, selectedBookId, rawChapters, startChapterIdx, refresh, navigate]);

  const hasData = !!data || !!error;
  const [howToOpen, setHowToOpen] = useState(!hasData);

  if (loading) {
    return (
      <StudioShell>
        <div className="mx-auto max-w-[900px] px-6 lg:px-10 pt-24 text-center">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" strokeWidth={1.4} />
          <p className="mt-4 text-muted-foreground text-sm">Decoding import data…</p>
        </div>
      </StudioShell>
    );
  }

  return (
    <StudioShell>
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-10 pt-6 sm:pt-10 pb-32">
        <button
          className="text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-4"
          onClick={() => navigate("/library")}
        >
          ← Back to library
        </button>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="studio-caps text-muted-foreground">Import translations</div>
        {hasData ? (
          <>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl mt-1 tracking-tight">
              {data ? `${data.chapters.length} chapter${data.chapters.length !== 1 ? "s" : ""} scraped` : "Import error"}
            </h1>
            {data && (
              <p className="text-xs text-muted-foreground mt-2 truncate max-w-[60ch]">
                From: {data.source}
              </p>
            )}
            {error && (
              <p className="text-sm text-muted-foreground mt-2 max-w-[58ch]">{error}</p>
            )}
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl mt-1 tracking-tight">
              Grab chapters from the web
            </h1>
            <p className="text-muted-foreground mt-2 text-sm max-w-[58ch] leading-relaxed">
              Use the bookmarklet on any novel site to scrape translated chapters,
              then come back here to import them into your books. One tap — no copy-paste.
            </p>
          </>
        )}

        {/* ── Import UI (when data is present) ──────────────────── */}
        {data && (
          <>
            {/* Book selector */}
            <div className="mt-8 space-y-4">
              <div className="studio-card p-4 sm:p-5">
                <label className="studio-caps text-muted-foreground block mb-2">Import into</label>
                <select
                  value={selectedBookId}
                  onChange={(e) => setSelectedBookId(e.target.value)}
                  className="w-full bg-muted/50 border border-border focus:border-foreground outline-none px-3 py-2.5 rounded text-sm transition-colors"
                >
                  <option value="">Select a book…</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} · {b.author} · {rawChapters.length || b.chapterOrder.length} chapters
                    </option>
                  ))}
                </select>
              </div>

              {selectedBook && rawChapters.length > 0 && (
                <div className="studio-card p-4 sm:p-5">
                  <label className="studio-caps text-muted-foreground block mb-2">
                    Start matching from chapter
                  </label>
                  <select
                    value={startChapterIdx}
                    onChange={(e) => setStartChapterIdx(Number(e.target.value))}
                    className="w-full bg-muted/50 border border-border focus:border-foreground outline-none px-3 py-2.5 rounded text-sm transition-colors"
                  >
                    {rawChapters.map((c, i) => (
                      <option key={c.id} value={i}>
                        Ch {i + 1}: {c.title}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    First scraped chapter → Chapter {startChapterIdx + 1} of "{selectedBook.title}"
                  </p>
                </div>
              )}
            </div>

            {/* Match preview */}
            {selectedBook && matchPreview.length > 0 && (
              <section className="mt-8">
                <div className="studio-caps text-muted-foreground mb-3">Match preview</div>
                <div className="border border-border overflow-hidden rounded">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-border bg-muted/30 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <span className="col-span-1">#</span>
                    <span className="col-span-5">Scraped chapter</span>
                    <span className="col-span-5">Raw chapter</span>
                    <span className="col-span-1 text-center">OK?</span>
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto thin-scrollbar divide-y divide-border">
                    {matchPreview.map((m) => (
                      <div key={m.scrapedIdx} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center">
                        <span className="col-span-1 text-muted-foreground tabular-nums text-xs">
                          {m.scrapedIdx + 1}
                        </span>
                        <span className="col-span-5 truncate" title={m.scrapedTitle}>
                          {m.scrapedTitle}
                          <span className="text-muted-foreground ml-1.5 text-[10px]">({m.paras}p)</span>
                        </span>
                        <span className="col-span-5 truncate" title={m.rawTitle ?? ""}>
                          {m.rawTitle ?? <span className="text-muted-foreground italic">No raw chapter</span>}
                          {m.rawParas != null && (
                            <span className="text-muted-foreground ml-1.5 text-[10px]">({m.rawParas}p)</span>
                          )}
                        </span>
                        <span className="col-span-1 text-center">
                          {m.match === "ok" ? (
                            <Check className="w-4 h-4 inline text-green-500" strokeWidth={2} />
                          ) : m.match === "mismatch" ? (
                            <span className="text-[10px] text-orange-400 font-medium">PARA</span>
                          ) : (
                            <X className="w-3.5 h-3.5 inline text-muted-foreground/40" strokeWidth={1.5} />
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {matchPreview.some((m) => m.match === "mismatch") && (
                  <p className="mt-3 text-[11px] text-orange-400/80">
                    ⚠ Some chapters have different paragraph counts. Paragraphs will be paired 1:1 — extras skipped.
                  </p>
                )}
              </section>
            )}

            {/* Import button */}
            {selectedBook && matchPreview.length > 0 && (
              <div className="mt-8 flex items-center gap-3">
                <button
                  type="button"
                  disabled={importing}
                  onClick={onImport}
                  className="h-12 px-6 inline-flex items-center gap-2 rounded-lg bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 active:scale-[0.97] transition-all font-medium text-sm"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} />
                      Importing… ({imported}/{matchPreview.length})
                    </>
                  ) : (
                    <>
                      <BookOpen className="w-4 h-4" strokeWidth={1.4} />
                      Import {matchPreview.filter((m) => m.match !== "no-raw").length} chapters
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/library")}
                  className="h-12 px-4 inline-flex items-center gap-2 rounded-lg border border-border/50 hover:bg-muted transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Tutorial section ──────────────────────────────────── */}
        <div className="mt-10">
          <button
            type="button"
            onClick={() => setHowToOpen((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Bookmark className="w-4 h-4" strokeWidth={1.4} />
            <span>{howToOpen ? "Hide" : "Show"} tutorial — How to grab chapters</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", howToOpen && "rotate-180")} strokeWidth={1.4} />
          </button>

          {howToOpen && (
            <div className="mt-6 space-y-10">
              {/* ── Section 1: Install the bookmarklet ───────────── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold">1</span>
                  <h2 className="text-base font-semibold">Install the bookmarklet (once)</h2>
                </div>

                <p className="text-sm text-muted-foreground mb-5 leading-relaxed max-w-[58ch]">
                  A bookmarklet is a bookmark that runs code instead of opening a URL. Install once — works forever.
                  <strong>Two versions below:</strong> pick the one for your browser.
                </p>

                {/* ⚠️ Critical warning */}
                <div className="border border-orange-400/30 bg-orange-400/5 rounded-lg p-4 mb-5">
                  <div className="flex gap-3">
                    <span className="text-lg shrink-0">⚠️</span>
                    <div className="text-sm leading-relaxed">
                      <p className="font-medium text-foreground mb-1">Do NOT paste into the address bar!</p>
                      <p className="text-muted-foreground">
                        Mobile browsers block <code className="font-mono text-[10px]">javascript:</code> in the address bar.
                        You MUST save it as a <strong>bookmark</strong> (follow the steps below), then tap the bookmark
                        from your bookmarks menu while on the novel site.
                      </p>
                    </div>
                  </div>
                </div>

                {/* iPhone instructions */}
                <div className="border border-border rounded-lg p-4 sm:p-5 mb-4">
                  <h3 className="text-sm font-medium mb-3">📱 iPhone / iPad — Safari</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">Use the <strong>Full version</strong> below.</p>
                  <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside leading-relaxed">
                    <li>Open <strong>Safari</strong> (not Chrome or Edge — those can't run bookmarklets on iPhone)</li>
                    <li>Go to <strong>any website</strong> (e.g. google.com) — it doesn't matter which</li>
                    <li>Tap the <strong>Share</strong> button <span className="text-foreground">↑</span> (square with arrow)</li>
                    <li>Scroll down → tap <strong>"Add Bookmark"</strong> → tap <strong>Save</strong></li>
                    <li>Tap the <strong>Bookmarks icon</strong> 📖 (open book icon at bottom)</li>
                    <li>Find the bookmark you just made → tap <strong>Edit</strong> (bottom right)</li>
                    <li>Tap the bookmark → rename it to <strong>"Grab Chapters"</strong></li>
                    <li>Delete the URL → paste the code below → tap <strong>Done</strong></li>
                  </ol>
                </div>

                {/* iPhone Edge / Chrome note */}
                <div className="border border-orange-400/30 bg-orange-400/5 rounded-lg p-4 mb-4">
                  <div className="flex gap-3">
                    <span className="text-lg shrink-0">⚠️</span>
                    <div className="text-sm">
                      <p className="font-medium text-foreground mb-1">iPhone Edge / Chrome users:</p>
                      <p className="text-muted-foreground leading-relaxed">
                        On iPhone, Edge and Chrome don't support <code className="font-mono text-[10px]">javascript:</code> bookmarks.
                        Use <strong>Safari</strong> to install the bookmarklet — once saved, you can browse with any browser
                        and open the bookmarklet in Safari whenever you need to scrape chapters.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Android Chrome instructions */}
                <div className="border border-border rounded-lg p-4 sm:p-5 mb-4">
                  <h3 className="text-sm font-medium mb-3">📱 Android — Chrome</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">Use the <strong>Short bootstrap</strong> (Edge/Chrome block long URLs).</p>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside leading-relaxed">
                    <li>Open Chrome → tap the <strong>⋮</strong> menu (top right)</li>
                    <li>Tap <strong>☆ Star</strong> (add bookmark) → tap <strong>Edit</strong></li>
                    <li>Name: <strong>"Grab Chapters"</strong></li>
                    <li>Delete the URL → paste the code below → tap <strong>✓</strong> or <strong>Save</strong></li>
                    <li>To use: open the novel site → tap address bar → type "Grab Chapters" → tap it</li>
                  </ol>
                </div>

                {/* Android Edge instructions */}
                <div className="border border-border rounded-lg p-4 sm:p-5 mb-4">
                  <h3 className="text-sm font-medium mb-3">📱 Android — Edge</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">Use the <strong>Short bootstrap</strong> (Edge blocks long javascript: URLs).</p>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside leading-relaxed">
                    <li>Open Edge → tap the <strong>⋯</strong> menu (bottom center)</li>
                    <li>Tap <strong>"Add to favorites"</strong> → tap <strong>Edit</strong> (pencil icon)</li>
                    <li>Name: <strong>"Grab Chapters"</strong></li>
                    <li>Delete the URL → paste the code below → tap <strong>Save</strong></li>
                    <li>To use: open the novel site → tap address bar → type "Grab Chapters" → tap it</li>
                  </ol>
                </div>

                {/* Android Firefox instructions */}
                <div className="border border-border rounded-lg p-4 sm:p-5 mb-4">
                  <h3 className="text-sm font-medium mb-3">📱 Android — Firefox</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">Use the <strong>Full version</strong> (Firefox handles long URLs fine).</p>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside leading-relaxed">
                    <li>Open Firefox → tap the <strong>⋮</strong> menu (top right)</li>
                    <li>Tap <strong>☆</strong> (bookmark) → tap <strong>Edit</strong></li>
                    <li>Name: <strong>"Grab Chapters"</strong></li>
                    <li>Delete the URL → paste the code below → tap <strong>✓</strong></li>
                    <li>To use: go to novel site → tap ⋮ → <strong>Bookmarks</strong> → "Grab Chapters"</li>
                  </ol>
                </div>

                {/* Desktop instructions */}
                <div className="border border-border rounded-lg p-4 sm:p-5 mb-4">
                  <h3 className="text-sm font-medium mb-3">💻 Desktop (Chrome / Edge / Firefox)</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">Either version works on desktop. The Full version is recommended (no network dependency).</p>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside leading-relaxed">
                    <li>Make sure your bookmarks bar is visible (Ctrl+Shift+B in most browsers)</li>
                    <li>Right-click the bookmarks bar → <strong>"Add page"</strong></li>
                    <li>Name: <strong>"Grab Chapters"</strong></li>
                    <li>URL: paste the code below</li>
                    <li>Save — done! Click it on any novel site to scrape chapters.</li>
                  </ol>
                </div>

                {/* ── Full version (Safari / Firefox) ───────────── */}
                <div className="border border-border rounded-lg overflow-hidden mb-4">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
                    <span className="text-xs text-muted-foreground font-mono">Full version — Safari / Firefox / Desktop</span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(BOOKMARKLET_FULL);
                          toast.success("Full version copied!");
                        } catch {
                          toast.error("Failed to copy — select the text manually.");
                        }
                      }}
                      className="h-7 px-2.5 inline-flex items-center gap-1.5 border border-border hover:border-foreground/40 transition-colors text-xs rounded"
                    >
                      <Copy className="w-3 h-3" strokeWidth={1.4} />
                      Copy (9 KB)
                    </button>
                  </div>
                  <div className="p-4 bg-muted/20">
                    <code className="text-[10px] sm:text-[11px] font-mono text-foreground/60 break-all leading-relaxed select-all line-clamp-3">
                      {BOOKMARKLET_FULL}
                    </code>
                  </div>
                </div>

                {/* ── Short bootstrap (Edge / Chrome mobile) ──────── */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
                    <span className="text-xs text-muted-foreground font-mono">Short bootstrap — Edge / Chrome mobile</span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(BOOKMARKLET_BOOTSTRAP);
                          toast.success("Bootstrap version copied!");
                        } catch {
                          toast.error("Failed to copy — select the text manually.");
                        }
                      }}
                      className="h-7 px-2.5 inline-flex items-center gap-1.5 border border-border hover:border-foreground/40 transition-colors text-xs rounded"
                    >
                      <Copy className="w-3 h-3" strokeWidth={1.4} />
                      Copy (~80 chars)
                    </button>
                  </div>
                  <div className="p-4 bg-muted/20">
                    <code className="text-[11px] sm:text-xs font-mono text-foreground/80 break-all leading-relaxed select-all">
                      {BOOKMARKLET_BOOTSTRAP}
                    </code>
                  </div>
                </div>
              </section>

              {/* ── Section 2: Scrape chapters ───────────────────── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold">2</span>
                  <h2 className="text-base font-semibold">Scrape translated chapters</h2>
                </div>

                <div className="border border-border rounded-lg p-4 sm:p-5 space-y-3">
                  <div className="flex gap-3">
                    <Globe className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.4} />
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>Go to the novel site → open the <strong>Table of Contents</strong> page (the page that lists all chapter links).</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Bookmark className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.4} />
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>Tap your bookmarks → tap <strong>"Grab Chapters"</strong>.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Zap className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.4} />
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>A bar appears at the bottom. It finds all chapter links, fetches each one, and extracts just the translated text. <strong>~10–20 seconds for 100 chapters.</strong></p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Sparkles className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.4} />
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>Tap <strong>"Send N chapters"</strong> → a new tab opens here with all the data ready to import.</p>
                    </div>
                  </div>
                </div>

                {/* How it works technically */}
                <div className="mt-4 border border-border rounded-lg p-4 sm:p-5 bg-muted/10">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-[0.12em] mb-2">How it works</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground leading-relaxed">
                    <div className="p-3 border border-border/50 rounded">
                      <div className="font-medium text-foreground mb-1">1. Fast fetch</div>
                      <p>Tries the quickest method first — sends your browser cookies with the request. Works on most sites.</p>
                    </div>
                    <div className="p-3 border border-border/50 rounded">
                      <div className="font-medium text-foreground mb-1">2. Cloudflare bypass</div>
                      <p>If the site says "Checking your browser…", it falls back to a hidden iframe — which passes Cloudflare's checks naturally since you're already browsing the site.</p>
                    </div>
                    <div className="p-3 border border-border/50 rounded">
                      <div className="font-medium text-foreground mb-1">3. Smart extraction</div>
                      <p>Finds the largest text block on each chapter page, strips ads/navigation/comments, and keeps only the translated paragraphs.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Section 3: Import into your book ─────────────── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold">3</span>
                  <h2 className="text-base font-semibold">Import into your book</h2>
                </div>

                <div className="border border-border rounded-lg p-4 sm:p-5 space-y-3">
                  <div className="flex gap-3">
                    <span className="text-muted-foreground shrink-0 mt-0.5">1.</span>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>After the bookmarklet sends you here, pick which <strong>book</strong> to import into.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground shrink-0 mt-0.5">2.</span>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>Choose the <strong>starting chapter</strong> — the first scraped chapter maps to this raw chapter. (Use this when importing chapters 50–100 of a 200-chapter book.)</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground shrink-0 mt-0.5">3.</span>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>Review the <strong>match preview</strong> — ✅ green check = paragraph counts match, ⚠ = counts differ (still works, extras are skipped).</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground shrink-0 mt-0.5">4.</span>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>Tap <strong>"Import N chapters"</strong> — all translations are saved instantly, paired 1:1 with your raws.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Troubleshooting ──────────────────────────────── */}
              <section>
                <h2 className="text-base font-semibold mb-3">Troubleshooting</h2>
                <div className="border border-border rounded-lg divide-y divide-border">
                  <div className="p-4">
                    <div className="text-sm font-medium text-foreground mb-1">"No chapters found"</div>
                    <p className="text-xs text-muted-foreground">Make sure you're on the <strong>Table of Contents / Index</strong> page — the page listing every chapter link. Single-chapter pages only grab that one chapter. If the site uses unusual link patterns, try the paste fallback below.</p>
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-medium text-foreground mb-1">"Couldn't fetch any chapters"</div>
                    <p className="text-xs text-muted-foreground">Some sites block all automated requests (even iframes). For these, manually copy the translated text and paste it in the BookEditor's Edit mode for each chapter.</p>
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-medium text-foreground mb-1">Bookmarklet does nothing when tapped</div>
                    <p className="text-xs text-muted-foreground">Make sure you pasted the <strong>full code</strong> — it starts with <code className="font-mono text-[10px]">javascript:</code> and is about 9,000 characters. If the <code className="font-mono text-[10px]">javascript:</code> prefix gets stripped (common on iPhone), add it back manually before pasting. On some Android browsers, you may need to paste into a notes app first, copy again, then paste into the bookmark URL field.</p>
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-medium text-foreground mb-1">Doesn't work on Edge / Chrome mobile</div>
                    <p className="text-xs text-muted-foreground">Make sure you're using the <strong>Short bootstrap</strong> version, not the Full version — Edge and Chrome block long <code className="font-mono text-[10px]">javascript:</code> URLs. Also ensure: (1) you saved it as a bookmark (not pasted in the address bar), (2) the <code className="font-mono text-[10px]">javascript:</code> prefix wasn't stripped, (3) you're on the novel site when tapping the bookmark.</p>
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-medium text-foreground mb-1">Data too large error</div>
                    <p className="text-xs text-muted-foreground">Try scraping fewer chapters at once (e.g., 50 at a time). Very long books may exceed URL length limits on some browsers.</p>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
