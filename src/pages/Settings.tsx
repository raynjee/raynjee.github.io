// Settings — API provider configuration, translation preferences, and
// studio housekeeping (theme, backup, restore). Includes a tutorial for
// the DeepSeek local proxy.

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Download,
  FileDown,
  Gauge,
  KeyRound,
  Loader2,
  Plus,
  Upload,
  HelpCircle,
  Terminal,
  Check,
  Copy,
  X,
} from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { useSettings } from "@/hooks/use-settings";
import { PROVIDERS } from "@/lib/translators/types";
import { buildBackup, restoreBackup, listLogs, appendLog } from "@/lib/db";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/util";
import { setGeminiRpmLimit, geminiRpmUsage } from "@/lib/translators/gemini";
import type { ApiCallLog, ProviderId, StudioSettings, Quality, SourceLanguage } from "@/lib/types";

const GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

export default function SettingsPage() {
  const { settings, update } = useSettings();

  return (
    <StudioShell>
      <div className="mx-auto max-w-[1100px] px-6 lg:px-10 pt-10 pb-20">
        <div className="studio-caps text-muted-foreground">The Back Room</div>
        <h1 className="font-display text-2xl sm:text-3xl lg:text-5xl mt-2 tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-3 max-w-[58ch]">
          API keys, proxy configuration, translation preferences, and the
          studio's housekeeping. Everything lives on your machine.
        </p>

        <div className="mt-0 space-y-10 sm:space-y-12">
          <DeepSeekTutorial />
          <ProviderSettings settings={settings} update={update} canEdit={true} />
          <TranslationPreferences settings={settings} update={update} canEdit={true} />
          <LogsCard />
          <BackupPanel canEdit={true} />
        </div>
      </div>
    </StudioShell>
  );
}

// ── DeepSeek Proxy Tutorial ──────────────────────────────────────────────

const DEEPSEEK_REPO = "https://github.com/sums001/Deepseek-API";

// Embedded helper files for download
const APP_PY = `import os
import uvicorn
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    uvicorn.run(
        "server.api:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
`;

const CORS_SHIM_PY = `#!/usr/bin/env python3
"""
cors_shim.py — light CORS-enabled reverse proxy in front of the
sums001/Deepseek-API proxy.

Why it exists
=============
The sums001/Deepseek-API reverse-engineered DeepSeek proxy
(https://github.com/sums001/Deepseek-API) exposes /v1/chat/completions,
/v1/models and /healthz but ships WITHOUT FastAPI's CORSMiddleware.
Browser tabs at a non-localhost origin (e.g. https://freebuff.com) send a
CORS preflight before POST, the proxy returns 405 with no Allow-Origin
headers, the browser rejects the preflight, and fetch() throws
"Failed to fetch" — even though the proxy itself is up and answering 200 OK.

This shim listens on a separate port (default 8001), forwards every request
through to the real proxy, and adds CORS headers so the preflight passes.

Install & run
==============
The sums001 proxy already pulls in fastapi + uvicorn. Add httpx and run:

    pip install httpx
    python cors_shim.py

Override defaults via env vars:

    UPSTREAM=http://127.0.0.1:8000
    LISTEN_HOST=127.0.0.1
    LISTEN_PORT=8001
    PROXY_TIMEOUT_SECS=180
    python cors_shim.py
"""

import os

import httpx
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

UPSTREAM = os.environ.get("UPSTREAM", "http://127.0.0.1:8000").rstrip("/")
LISTEN_HOST = os.environ.get("LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("LISTEN_PORT", "8001"))
PROXY_TIMEOUT = float(os.environ.get("PROXY_TIMEOUT_SECS", "180"))

_upstream = httpx.AsyncClient(timeout=httpx.Timeout(PROXY_TIMEOUT))

_HOP_BY_HOP_HEADERS = frozenset(
    h.lower()
    for h in (
        "host",
        "content-length",
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
    )
)

app = FastAPI(title="Freebuff CORS shim", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.api_route(
    "/{full_path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
)
async def proxy(full_path: str, request: Request) -> Response:
    url = f"{UPSTREAM}/{full_path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    body = await request.body()
    forwarded_headers = {
        k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP_HEADERS
    }

    upstream = await _upstream.request(
        method=request.method,
        url=url,
        content=body,
        headers=forwarded_headers,
    )

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=dict(upstream.headers),
    )


if __name__ == "__main__":
    print(
        f"cors_shim listening on http://{LISTEN_HOST}:{LISTEN_PORT}, "
        f"forwarding to {UPSTREAM} (timeout {PROXY_TIMEOUT}s)"
    )
    uvicorn.run(app, host=LISTEN_HOST, port=LISTEN_PORT, log_level="info")
`;

const RUN_BAT = `@echo off
title DeepSeek Servers

echo Starting DeepSeek Server and CORS Shim...
echo.

start "DeepSeek Server" /B python app.py
timeout /t 2 /nobreak >nul
start "CORS Shim" /B python cors_shim.py

echo Both servers are running!
echo DeepSeek: http://localhost:8000
echo CORS Shim: http://localhost:8001
echo.
echo Press Ctrl+C to stop both servers.

pause
`;

function DeepSeekTutorial() {
  const [copied, setCopied] = useState(false);

  const commands = [
    "git clone https://github.com/sums001/Deepseek-API",
    "cd Deepseek-API",
    "pip install httpx",
    "python -m deepseek.auth",
    "# Then download the 3 helper files below into this folder",
    "# and double-click run.bat to start both servers",
  ].join("\n");

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(commands);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Commands copied to clipboard.");
    } catch {
      toast.error("Failed to copy — copy them manually below.");
    }
  };

  const downloadFile = (filename: string, content: string, label: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success(`${label} downloaded.`);
  };

  return (
    <section className="studio-card p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Terminal className="w-5 h-5 text-foreground mt-0.5" strokeWidth={1.4} />
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
            <div>
              <div className="studio-caps text-muted-foreground">Setup Guide</div>
              <h2 className="font-display text-xl sm:text-2xl mt-0.5">Run the DeepSeek proxy</h2>
            </div>
            <button
              onClick={onCopy}
              className="h-9 px-3 inline-flex items-center gap-2 border border-border hover:border-foreground/40"
            >
              {copied ? (
                <Check className="w-4 h-4" strokeWidth={1.4} />
              ) : (
                <Copy className="w-4 h-4" strokeWidth={1.4} />
              )}
              <span className="text-xs uppercase tracking-[0.18em]">
                {copied ? "Copied" : "Copy"}
              </span>
            </button>
          </div>

          <p className="text-muted-foreground text-sm leading-relaxed mt-3 max-w-[66ch]">
            DeepSeek translations run through a local proxy — a thin Python
            server that forwards your paragraph batches to the DeepSeek web
            client using a one-time browser sign-in. Once it is running, every
            translate button in the studio talks to it automatically.
          </p>

          <div className="mt-4 bg-muted/50 border border-border p-3 sm:p-4 font-mono text-[11px] sm:text-xs leading-relaxed text-foreground/85 overflow-x-auto">
            <div className="text-muted-foreground mb-2 uppercase tracking-[0.18em]">
              Terminal — run these once
            </div>
            {commands.split("\n").map((line, i) => (
              <div key={i} className="flex gap-3">
                <span className="select-none text-muted-foreground">$</span>
                <span className={line.startsWith("#") ? "text-muted-foreground italic" : ""}>{line}</span>
              </div>
            ))}
          </div>

          {/* Download buttons */}
          <div className="mt-4">
            <div className="text-muted-foreground text-xs uppercase tracking-[0.18em] mb-3">
              Helper files — download these into your Deepseek-API folder
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadFile("cors_shim.py", CORS_SHIM_PY, "cors_shim.py")}
                className="h-9 px-3 inline-flex items-center gap-2 border border-border hover:border-foreground/40 text-xs"
              >
                <FileDown className="w-3.5 h-3.5" strokeWidth={1.4} />
                <span className="uppercase tracking-[0.18em]">cors_shim.py</span>
              </button>
              <button
                onClick={() => downloadFile("run.bat", RUN_BAT, "run.bat")}
                className="h-9 px-3 inline-flex items-center gap-2 border border-border hover:border-foreground/40 text-xs"
              >
                <FileDown className="w-3.5 h-3.5" strokeWidth={1.4} />
                <span className="uppercase tracking-[0.18em]">run.bat</span>
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border border-border p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                DeepSeek port
              </div>
              <div className="font-mono text-lg mt-1">8000</div>
              <div className="text-xs text-muted-foreground mt-1">
                The raw proxy served by <code className="font-mono">app.py</code>.
              </div>
            </div>
            <div className="border border-border p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                CORS shim port
              </div>
              <div className="font-mono text-lg mt-1">8001</div>
              <div className="text-xs text-muted-foreground mt-1">
                CORS-enabled gateway served by <code className="font-mono">cors_shim.py</code>.
                Set your endpoint to this port.
              </div>
            </div>
            <div className="border border-border p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Endpoint
              </div>
              <div className="font-mono text-xs mt-1 break-all">
                http://127.0.0.1:8001/v1
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Set this in the endpoint URL field below.
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 p-3 border border-border">
            <HelpCircle className="w-4 h-4 text-foreground mt-0.5 shrink-0" strokeWidth={1.4} />
            <div>
              <span className="font-semibold text-foreground">Note:</span> The
              proxy serializes requests — it processes one at a time. The
              30 RPM rate limit is enforced by DeepSeek itself. See{" "}
              <a
                href={DEEPSEEK_REPO}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                sums001/Deepseek-API
              </a>{" "}
              for full docs.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Providers ────────────────────────────────────────────────────────────

function ProviderSettings({
  settings,
  update,
  canEdit,
}: {
  settings: StudioSettings;
  update: (p: Partial<StudioSettings>) => void;
  canEdit: boolean;
}) {
  const [testing, setTesting] = useState<Record<ProviderId, boolean>>({
    deepseek: false,
    gemini: false,
  });
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string } | null>>(
    { deepseek: null, gemini: null },
  );

  const runTest = async (id: ProviderId) => {
    setTesting((t) => ({ ...t, [id]: true }));
    const cfg = settings.providers.find((p) => p.id === id);
    if (!cfg) return;
    const res = await PROVIDERS[id].testConnection(cfg);
    setResults((r) => ({ ...r, [id]: res }));
    setTesting((t) => ({ ...t, [id]: false }));
    await appendLog({
      id: `${id}_test_${Date.now()}`,
      provider: id,
      ok: res.ok,
      status: res.ok ? 200 : 0,
      message: res.message,
      at: Date.now(),
    });
    if (res.ok) toast.success(`${id === "deepseek" ? "DeepSeek" : "Gemini"} ready.`);
    else toast.error(`${id === "deepseek" ? "DeepSeek" : "Gemini"} failed: ${res.message}`);
  };

  return (
    <section>
      <SectionHeader eyebrow="API Keys" title="Translation providers" />
      <p className="text-muted-foreground max-w-[58ch] text-sm leading-relaxed">
        Configure one or both providers. The studio automatically fails over
        when a provider is rate limited or unreachable. DeepSeek uses the local
        proxy — Gemini needs an API key.
      </p>
      <div className="mt-6 grid gap-4 sm:gap-6 lg:grid-cols-2">
        {settings.providers.map((cfg) => {
          const result = results[cfg.id];
          const isDS = cfg.id === "deepseek";
          return (
            <div key={cfg.id} className="studio-card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="studio-caps text-muted-foreground">{cfg.id}</div>
                  <div className="font-display text-xl mt-1">
                    {isDS ? "DeepSeek" : "Gemini"}
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={cfg.enabled}
                    onChange={(e) =>
                      update({
                        providers: settings.providers.map((p) =>
                          p.id === cfg.id ? { ...p, enabled: e.target.checked } : p,
                        ),
                      })
                    }
                  />
                  <span className="uppercase tracking-[0.18em]">Enabled</span>
                </label>
              </div>

              {isDS ? (
                /* DeepSeek: proxy endpoint — no API key */
                <div className="mt-5 grid gap-3">
                  <Field label="Proxy endpoint URL">
                    <input
                      disabled={!canEdit}
                      value={cfg.baseUrl ?? ""}
                      placeholder="http://127.0.0.1:8001/v1"
                      onChange={(e) =>
                        update({
                          providers: settings.providers.map((p) =>
                            p.id === cfg.id ? { ...p, baseUrl: e.target.value } : p,
                          ),
                        })
                      }
                      className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-3 font-mono text-base"
                    />
                  </Field>
                  <Field label="Model">
                    <input
                      disabled={!canEdit}
                      value={cfg.model ?? ""}
                      placeholder="deepseek-chat"
                      onChange={(e) =>
                        update({
                          providers: settings.providers.map((p) =>
                            p.id === cfg.id ? { ...p, model: e.target.value } : p,
                          ),
                        })
                      }
                      className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-2"
                    />
                  </Field>
                  <div className="border border-border p-3 mt-1 text-xs text-muted-foreground leading-relaxed">
                    <span className="text-foreground font-medium">No API key required.</span>{" "}
                    The proxy authenticates via your browser sign-in (see the setup
                    guide above). Make sure the proxy is running before
                    translating.
                  </div>
                </div>
              ) : (
                /* Gemini: needs API keys — primary + rotation keys */
                <div className="mt-5 grid gap-3">
                  <Field label="Primary API key">
                    <input
                      disabled={!canEdit}
                      type="password"
                      placeholder="AIza…"
                      value={cfg.apiKey ?? ""}
                      onChange={(e) =>
                        update({
                          providers: settings.providers.map((p) =>
                            p.id === cfg.id ? { ...p, apiKey: e.target.value } : p,
                          ),
                        })
                      }
                      className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-3 font-mono text-base"
                    />
                  </Field>

                  {/* Rotation keys */}
                  {(cfg.apiKeys ?? []).map((key, ki) => (
                    <Field key={ki} label={`Rotation key ${ki + 1}`}>
                      <div className="flex items-center gap-2">
                        <input
                          disabled={!canEdit}
                          type="password"
                          placeholder="AIza…"
                          value={key}
                          onChange={(e) =>
                            update({
                              providers: settings.providers.map((p) =>
                                p.id === cfg.id
                                  ? {
                                      ...p,
                                      apiKeys: (p.apiKeys ?? []).map((k, j) =>
                                        j === ki ? e.target.value : k,
                                      ),
                                    }
                                  : p,
                              ),
                            })
                          }
                          className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-3 font-mono text-base"
                        />
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() =>
                            update({
                              providers: settings.providers.map((p) =>
                                p.id === cfg.id
                                  ? {
                                      ...p,
                                      apiKeys: (p.apiKeys ?? []).filter((_, j) => j !== ki),
                                    }
                                  : p,
                              ),
                            })
                          }
                          className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove this key"
                        >
                          <X className="w-4 h-4" strokeWidth={1.4} />
                        </button>
                      </div>
                    </Field>
                  ))}

                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      update({
                        providers: settings.providers.map((p) =>
                          p.id === cfg.id
                            ? { ...p, apiKeys: [...(p.apiKeys ?? []), ""] }
                            : p,
                        ),
                      })
                    }
                    className="h-8 px-3 inline-flex items-center gap-1.5 border border-border hover:border-foreground/40 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={1.4} />
                    <span className="uppercase tracking-[0.18em]">Add rotation key</span>
                  </button>

                  {((cfg.apiKeys ?? []).length > 0) && (
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                      When the primary key hits a rate limit (429), the studio
                      automatically rotates to the next key. Working keys are
                      promoted to primary for the next request.
                    </p>
                  )}

                  <Field label="Model">
                    <select
                      disabled={!canEdit}
                      value={cfg.model ?? "gemini-3.5-flash"}
                      onChange={(e) =>
                        update({
                          providers: settings.providers.map((p) =>
                            p.id === cfg.id ? { ...p, model: e.target.value } : p,
                          ),
                        })
                      }
                      className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-3 text-base"
                    >
                      {GEMINI_MODELS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </Field>

                  {/* RPM rate limiter — stays safely under Gemini free tier limit of 10 */}
                  <RpmControl
                    rpmLimit={settings.geminiRpmLimit ?? 8}
                    canEdit={canEdit}
                    onChange={(v) => {
                      setGeminiRpmLimit(v);
                      update({ geminiRpmLimit: v });
                    }}
                  />
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  disabled={testing[cfg.id]}
                  onClick={() => runTest(cfg.id)}
                  className="h-11 sm:h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40 disabled:opacity-50 active:scale-[0.97] transition-transform"
                >
                  {testing[cfg.id] ? (
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} />
                  ) : (
                    <KeyRound className="w-4 h-4" strokeWidth={1.4} />
                  )}
                  <span className="text-xs uppercase tracking-[0.18em]">
                    {testing[cfg.id] ? "Testing…" : "Test connection"}
                  </span>
                </button>
                {result && (
                  <span className={`text-xs ${result.ok ? "text-foreground" : "text-destructive"}`}>
                    {result.ok ? "✓ " : "✕ "}{result.message}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid lg:grid-cols-2 gap-4">
        <Field label="Preferred provider">
          <select
            disabled={!canEdit}
            value={settings.activeProvider}
            onChange={(e) =>
              update({ activeProvider: e.target.value as ProviderId })
            }
            className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-3 text-base"
          >
            {settings.providers.filter((p) => p.enabled).map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === "deepseek" ? "DeepSeek" : "Gemini"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Parallel translation chunks">
          <input
            disabled={!canEdit}
            type="number"
            min={1}
            max={5}
            value={settings.parallelRequests}
            onChange={(e) => update({ parallelRequests: Number(e.target.value) || 1 })}
            className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-3 text-base"
          />
        </Field>
      </div>
    </section>
  );
}

// ── Translation preferences ──────────────────────────────────────────────

function TranslationPreferences({
  settings,
  update,
  canEdit,
}: {
  settings: StudioSettings;
  update: (p: Partial<StudioSettings>) => void;
  canEdit: boolean;
}) {
  return (
    <section>
      <SectionHeader eyebrow="Preferences" title="Translation behavior" />
      <div className="mt-6 grid gap-4 sm:gap-6 md:grid-cols-3">
        <PreferenceCard
          title="Source language"
          help="Pick auto-detection if chapters mix languages."
        >
          <select
            disabled={!canEdit}
            value={settings.sourceLanguage}
            onChange={(e) =>
              update({ sourceLanguage: e.target.value as SourceLanguage })
            }
            className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-2"
          >
            <option value="auto">Auto-detect (recommended)</option>
            <option value="zh">Chinese (中文)</option>
            <option value="ja">Japanese (日本語)</option>
            <option value="ko">Korean (한국어)</option>
            <option value="en">English</option>
          </select>
        </PreferenceCard>
        <PreferenceCard
          title="Quality"
          help="Higher quality is slower; Fast skips nuance."
        >
          <div className="grid grid-cols-3 gap-2">
            {(["fast", "balanced", "high"] as Quality[]).map((q) => (
              <button
                key={q}
                disabled={!canEdit}
                onClick={() => update({ quality: q })}
                className={
                  "h-9 text-xs uppercase tracking-[0.18em] border " +
                  (settings.quality === q
                    ? "bg-foreground text-background border-foreground"
                    : "border-border hover:border-foreground/40")
                }
              >
                {q}
              </button>
            ))}
          </div>
        </PreferenceCard>
        <PreferenceCard
          title="Glossary chunk size"
          help={`${(settings.glossaryChunkSize ?? 4000).toLocaleString()} chars per API call. Lower = safer for free tiers, higher = faster for paid plans.`}
        >
          <div className="flex items-center gap-3">
            <input
              disabled={!canEdit}
              type="range"
              min={1000}
              max={16000}
              step={500}
              value={settings.glossaryChunkSize ?? 4000}
              onChange={(e) => update({ glossaryChunkSize: Number(e.target.value) })}
              className="flex-1 h-1 accent-foreground"
            />
            <span className="font-mono text-sm w-14 text-right tabular-nums">
              {(settings.glossaryChunkSize ?? 4000).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>Free tier</span>
            <span>Paid tier</span>
          </div>
        </PreferenceCard>
      </div>
    </section>
  );
}

// ── Logs ────────────────────────────────────────────────────────────────

function LogsCard() {
  const [logs, setLogs] = useState<ApiCallLog[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listLogs();
        if (!cancelled) setLogs(list);
      } catch (err) {
        console.error("listLogs failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return <LogsView logs={logs} />;
}

function LogsView({ logs }: { logs: ApiCallLog[] }) {
  if (logs.length === 0) {
    return (
      <section>
        <SectionHeader eyebrow="Logs" title="Translate something to populate the log" />
        <div className="studio-card p-6 text-sm text-muted-foreground">
          No translation calls have been logged yet. Press <em>Test connection</em> above
          or translate any paragraph to begin building a trail.
        </div>
      </section>
    );
  }
  return (
    <section>
      <SectionHeader eyebrow="Logs" title="Recent provider activity" />        <div className="studio-card divide-y divide-border max-h-[320px] overflow-auto thin-scrollbar">
        {logs.map((l) => (
          <div key={l.id} className="p-3 sm:p-4 flex flex-col sm:grid sm:grid-cols-12 sm:items-center gap-1 sm:gap-3 text-sm">
            <span className="sm:col-span-3 text-xs text-muted-foreground order-1">
              {formatRelativeTime(l.at)}
            </span>
            <span className="sm:col-span-2 uppercase tracking-[0.18em] text-xs order-2">
              {l.provider}
            </span>
            <span
              className={`sm:col-span-1 text-xs order-3 ${l.ok ? "text-foreground" : "text-destructive"}`}
            >
              {l.ok ? "OK" : l.status || "ERR"}
            </span>
            <span className="sm:col-span-6 truncate text-foreground/80 order-4">{l.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Backup / Restore ─────────────────────────────────────────────────────

function BackupPanel({ canEdit }: { canEdit: boolean }) {
  return (
    <section>
      <SectionHeader eyebrow="Storage" title="Backup & restore" />
      <p className="text-muted-foreground max-w-[58ch] text-sm leading-relaxed">
        Export your library, chapters, translations and settings as a single
        JSON file. Use it to move between browsers or machines.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={async () => {
            const data = await buildBackup();
            const blob = new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `atelier-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            toast.success("Backup downloaded.");
          }}
          className="h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40"
        >
          <Download className="w-4 h-4" strokeWidth={1.4} />
          <span className="text-xs uppercase tracking-[0.18em]">Download backup</span>
        </button>
        <label className="h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40 cursor-pointer">
          <Upload className="w-4 h-4" strokeWidth={1.4} />
          <span className="text-xs uppercase tracking-[0.18em]">Restore backup</span>
          <input
            type="file"
            accept="application/json"
            disabled={!canEdit}
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const raw = await file.text();
                const data = JSON.parse(raw);
                if (!data.version) throw new Error("Missing version field");
                if (!confirm("Restore will replace all books and translations. Continue?"))
                  return;
                await restoreBackup(data);
                toast.success("Backup restored. Reloading…");
                setTimeout(() => window.location.reload(), 600);
              } catch (err) {
                toast.error(`Restore failed: ${err instanceof Error ? err.message : "unknown"}`);
              }
            }}
          />
        </label>
      </div>
    </section>
  );
}

// ── Small shared bits ────────────────────────────────────────────────────

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="border-b border-border pb-3 mb-5 flex items-end justify-between">
      <div>
        <div className="studio-caps text-muted-foreground">{eyebrow}</div>
        <h2 className="font-display text-2xl mt-1">{title}</h2>
      </div>
    </header>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="studio-caps text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function PreferenceCard({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="studio-card p-5">
      <div className="studio-caps text-muted-foreground">{title}</div>
      <div className="mt-3">{children}</div>
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{help}</p>
    </div>
  );
}

// ── RPM rate-limit control (live usage indicator) ───────────────────────

function RpmControl({
  rpmLimit,
  canEdit,
  onChange,
}: {
  rpmLimit: number;
  canEdit: boolean;
  onChange: (v: number) => void;
}) {
  const [usage, setUsage] = useState(() => geminiRpmUsage());

  // Poll every second for live usage.
  useEffect(() => {
    const id = setInterval(() => setUsage(geminiRpmUsage()), 1000);
    return () => clearInterval(id);
  }, []);

  const pct = rpmLimit > 0 ? Math.min(100, (usage.used / rpmLimit) * 100) : 0;
  const near = pct >= 75;
  const atLimit = usage.used >= rpmLimit;

  return (
    <div className="border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-muted-foreground" strokeWidth={1.4} />
          <span className="studio-caps text-muted-foreground">RPM limit</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-sm tabular-nums ${
              atLimit ? "text-destructive" : near ? "text-amber-500" : "text-muted-foreground"
            }`}
          >
            {usage.used}/{rpmLimit}
          </span>
          {usage.nextSlotMs > 0 && (
            <span className="text-[10px] text-muted-foreground">
              next in {Math.ceil(usage.nextSlotMs / 1000)}s
            </span>
          )}
        </div>
      </div>

      {/* Mini progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            atLimit ? "bg-destructive" : near ? "bg-amber-500" : "bg-foreground/40"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          disabled={!canEdit}
          type="range"
          min={1}
          max={10}
          step={1}
          value={rpmLimit}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-1 accent-foreground"
        />
        <span className="font-mono text-sm w-6 text-right tabular-nums">{rpmLimit}</span>
      </div>

      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
        Caps Gemini API calls to stay safely under the free-tier limit of 10
        requests per minute. Calls beyond the limit are automatically delayed
        instead of failing.
      </p>
    </div>
  );
}

// Quiet static-import lints.
void motion;
