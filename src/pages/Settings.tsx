// Settings — API provider configuration, translation preferences, and
// studio housekeeping (theme, backup, restore). Includes a tutorial for
// the DeepSeek local proxy.

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  KeyRound,
  Loader2,
  Upload,
  HelpCircle,
  Terminal,
  Check,
  Copy,
} from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { useSettings } from "@/hooks/use-settings";
import { PROVIDERS } from "@/lib/translators/types";
import { buildBackup, restoreBackup, listLogs, appendLog } from "@/lib/db";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/util";
import type { ApiCallLog, ProviderId, StudioSettings, Quality, SourceLanguage } from "@/lib/types";

export default function SettingsPage() {
  const { settings, update } = useSettings();

  return (
    <StudioShell>
      <div className="mx-auto max-w-[1100px] px-6 lg:px-10 pt-10 pb-20">
        <div className="studio-caps text-muted-foreground">The Back Room</div>
        <h1 className="font-display text-5xl mt-2 tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-3 max-w-[58ch]">
          API keys, proxy configuration, translation preferences, and the
          studio's housekeeping. Everything lives on your machine.
        </p>

        <div className="mt-10 space-y-12">
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

function DeepSeekTutorial() {
  const [copied, setCopied] = useState(false);

  const commands = [
    "git clone https://github.com/sums001/Deepseek-API",
    "cd Deepseek-API",
    "python -m deepseek.auth",
    "# Once the browser login completes, set the port:",
    "uvicorn deepseek.server:app --host 127.0.0.1 --port 8081",
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

  return (
    <section className="studio-card p-6">
      <div className="flex items-start gap-3">
        <Terminal className="w-5 h-5 text-foreground mt-0.5" strokeWidth={1.4} />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="studio-caps text-muted-foreground">Setup Guide</div>
              <h2 className="font-display text-2xl mt-0.5">Run the DeepSeek proxy</h2>
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

          <div className="mt-4 bg-muted/50 border border-border p-4 font-mono text-xs leading-relaxed text-foreground/85 overflow-x-auto">
            <div className="text-muted-foreground mb-2 uppercase tracking-[0.18em]">
              Terminal — run these once
            </div>
            {commands.split("\n").map((line, i) => (
              <div key={i} className="flex gap-3">
                <span className="select-none text-muted-foreground">$</span>
                <span>{line}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="border border-border p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Port
              </div>
              <div className="font-mono text-lg mt-1">
                8081
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                The port set with <code className="font-mono">--port 8081</code> above. Change
                it in the endpoint URL field below if you pick a different one.
              </div>
            </div>
            <div className="border border-border p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Endpoint
              </div>
              <div className="font-mono text-sm mt-1">
                /v1/chat/completions
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                OpenAI-compatible — the proxy uses the same shape as the
                official API.
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 p-3 border border-border">
            <HelpCircle className="w-4 h-4 text-foreground mt-0.5 shrink-0" strokeWidth={1.4} />
            <div>
              <span className="font-semibold text-foreground">Note:</span> The
              proxy serializes requests — it processes one at a time. If
              translations feel slow, wait for the queue to drain. The 30 RPM
              rate limit is enforced by the proxy itself. See{" "}
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
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {settings.providers.map((cfg) => {
          const result = results[cfg.id];
          const isDS = cfg.id === "deepseek";
          return (
            <div key={cfg.id} className="studio-card p-5">
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
                      placeholder="http://127.0.0.1:8081/v1"
                      onChange={(e) =>
                        update({
                          providers: settings.providers.map((p) =>
                            p.id === cfg.id ? { ...p, baseUrl: e.target.value } : p,
                          ),
                        })
                      }
                      className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-2 font-mono text-sm"
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
                /* Gemini: needs an API key */
                <div className="mt-5 grid gap-3">
                  <Field label="API key">
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
                      className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-2 font-mono text-sm"
                    />
                  </Field>
                  <Field label="Model">
                    <input
                      disabled={!canEdit}
                      value={cfg.model ?? ""}
                      placeholder="gemini-1.5-flash-latest"
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
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  disabled={testing[cfg.id]}
                  onClick={() => runTest(cfg.id)}
                  className="h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40 disabled:opacity-50"
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
            className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-2"
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
            className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-2"
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
      <div className="mt-6 grid gap-6 md:grid-cols-3">
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
          title="On errors"
          help="What happens when a provider fails."
        >
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={settings.pauseOnError}
              onChange={(e) => update({ pauseOnError: e.target.checked })}
            />
            <span>Pause translation queue on first error</span>
          </label>
        </PreferenceCard>
      </div>
    </section>
  );
}

// ── Logs ────────────────────────────────────────────────────────────────

function LogsCard() {
  const [logs, setLogs] = useState<ApiCallLog[]>([]);
  useState(() => { void (async () => setLogs(await listLogs()))(); });
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
      <SectionHeader eyebrow="Logs" title="Recent provider activity" />
      <div className="studio-card divide-y divide-border max-h-[320px] overflow-auto thin-scrollbar">
        {logs.map((l) => (
          <div key={l.id} className="p-4 grid grid-cols-12 items-center gap-3 text-sm">
            <span className="col-span-3 text-xs text-muted-foreground">
              {formatRelativeTime(l.at)}
            </span>
            <span className="col-span-2 uppercase tracking-[0.18em] text-xs">
              {l.provider}
            </span>
            <span
              className={`col-span-1 text-xs ${l.ok ? "text-foreground" : "text-destructive"}`}
            >
              {l.ok ? "OK" : l.status || "ERR"}
            </span>
            <span className="col-span-6 truncate text-foreground/80">{l.message}</span>
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

// Quiet static-import lints.
void motion;
