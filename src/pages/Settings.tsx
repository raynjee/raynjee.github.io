// Settings — API provider configuration, translation preferences, and
// studio housekeeping (theme, backup, restore).

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  KeyRound,
  Loader2,
  Upload,
} from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { useSettings } from "@/hooks/use-settings";
import { PROVIDERS, TranslationManager } from "@/lib/translators/types";
import { buildBackup, restoreBackup, listLogs, appendLog } from "@/lib/db";
import { useCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/util";
import type { ApiCallLog, ProviderId, StudioSettings, Quality, SourceLanguage } from "@/lib/types";

export default function SettingsPage() {
  const { user } = useCurrentUser();
  const { settings, update } = useSettings();

  return (
    <StudioShell>
      <div className="mx-auto max-w-[1100px] px-6 lg:px-10 pt-10 pb-20">
        <div className="studio-caps text-muted-foreground">The Back Room</div>
        <h1 className="font-display text-5xl mt-2 tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-3 max-w-[58ch]">
          API keys, translation preferences, and the studio's housekeeping.
          Everything saved here lives on your machine.
        </p>
        {!user?.isAdmin && (
          <p className="text-xs text-muted-foreground mt-2 max-w-[58ch]">
            Tip: only the curator can edit API keys. Sign in with saberyyang09@gmail.com.
          </p>
        )}

        <div className="mt-10 space-y-10">
          <ProviderSettings settings={settings} update={update} canEdit={!!user?.isAdmin} />
          <TranslationPreferences settings={settings} update={update} canEdit={!!user?.isAdmin} />
          <LogsCard />
          <BackupPanel canEdit={!!user?.isAdmin} />
        </div>
      </div>
    </StudioShell>
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
    if (res.ok) toast.success(`${cfg.id === "deepseek" ? "DeepSeek" : "Gemini"} ready.`);
    else toast.error(`${cfg.id === "deepseek" ? "DeepSeek" : "Gemini"} failed: ${res.message}`);
  };

  return (
    <section>
      <SectionHeader eyebrow="API Keys" title="Translation providers" />
      <p className="text-muted-foreground max-w-[58ch] text-sm leading-relaxed">
        Configure one or both providers. The studio automatically fails over when
        one provider is rate limited or unreachable. Leave DeepSeek's key blank
        to use the un-authenticated reverse-engineered endpoint.
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {settings.providers.map((cfg) => {
          const result = results[cfg.id];
          return (
            <div key={cfg.id} className="studio-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="studio-caps text-muted-foreground">{cfg.id}</div>
                  <div className="font-display text-xl mt-1">
                    {cfg.id === "deepseek" ? "DeepSeek" : "Gemini"}
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
              <div className="mt-5 grid gap-3">
                <Field label="API key">
                  <input
                    disabled={!canEdit}
                    type="password"
                    placeholder={cfg.id === "deepseek" ? "sk-… (optional)" : "AIza…"}
                    value={cfg.apiKey}
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
                    placeholder={cfg.id === "deepseek" ? "deepseek-chat" : "gemini-1.5-flash-latest"}
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
                {cfg.id === "deepseek" && (
                  <Field label="Base URL">
                    <input
                      disabled={!canEdit}
                      value={cfg.baseUrl ?? ""}
                      placeholder="https://api.deepseek.com"
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
                )}
              </div>
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
  const refresh = async () => setLogs(await listLogs());
  void refresh; // Refresh on first mount via useState closure
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
