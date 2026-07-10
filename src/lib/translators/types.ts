// Provider abstraction for the translation pipeline.
// Each provider exposes translate(...) and a lightweight test() ping.

import type {
  GlossaryEntry,
  ProviderConfig,
  ProviderId,
  ProviderStatus,
  Quality,
  SourceLanguage,
} from "../types";
import { sha256Hex } from "../util";

export interface TranslateRequest {
  paragraphs: string[];
  source: SourceLanguage;
  target: "en";
  quality: Quality;
  contextHint?: string;
  glossary?: GlossaryEntry[];
}

export interface TranslateResult {
  provider: ProviderId;
  paragraphs: string[];
  cachedCount: number;
}

export interface ProviderClient {
  id: ProviderId;
  name: string;
  translate(
    cfg: ProviderConfig,
    req: TranslateRequest,
  ): Promise<TranslateResult>;
  testConnection(cfg: ProviderConfig): Promise<{
    ok: boolean;
    message: string;
  }>;
}

// ── Provider implementations ────────────────────────────────────────────

import { callDeepSeek } from "./deepseek";
import { callGemini } from "./gemini";

export const PROVIDERS: Record<ProviderId, ProviderClient> = {
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    translate: async (cfg, req) => {
      const out = await callDeepSeek(cfg, req);
      return { provider: "deepseek", ...out };
    },
    testConnection: (cfg) => testDeepSeek(cfg),
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    translate: async (cfg, req) => {
      const out = await callGemini(cfg, req);
      return { provider: "gemini", ...out };
    },
    testConnection: (cfg) => testGemini(cfg),
  },
};

// ── Manager: failover, rate limiting, caching ───────────────────────────

export interface ManagerOptions {
  providers: ProviderConfig[];
  preferred: ProviderId;
  parallelRequests: number;
  pauseOnError: boolean;
  quality: Quality;
  source: SourceLanguage;
  target: "en";
}

export interface ManagedProgress {
  done: number;
  total: number;
  provider: ProviderId | null;
  index: number;
}

class RateLimiter {
  // Per-provider suspension window. We suspend rather than count tokens
  // because rate limits vary widely across providers and we cannot trust
  // the byte header. This is adjusted with feedback from real failures.
  private suspendedUntil = new Map<ProviderId, number>();

  isSuspended(id: ProviderId): boolean {
    const until = this.suspendedUntil.get(id) ?? 0;
    if (until === 0) return false;
    if (Date.now() > until) {
      this.suspendedUntil.delete(id);
      return false;
    }
    return true;
  }

  suspend(id: ProviderId, ms: number) {
    const until = Date.now() + ms;
    this.suspendedUntil.set(id, until);
  }

  reset(id: ProviderId) {
    this.suspendedUntil.delete(id);
  }

  snapshot(): Record<ProviderId, number | null> {
    return {
      deepseek: this.suspendedUntil.get("deepseek") ?? null,
      gemini: this.suspendedUntil.get("gemini") ?? null,
    };
  }
}

class TranslationMemory {
  async get(key: string): Promise<string | null> {
    const entry = await (
      await import("../db")
    ).getCachedTranslation(key);
    return entry?.translated ?? null;
  }
  async put(key: string, translated: string, provider: ProviderId) {
    const { putCachedTranslation, trimCache } = await import("../db");
    await putCachedTranslation({
      key,
      translated,
      provider,
      cachedAt: Date.now(),
    });
    if (Math.random() < 0.01) void trimCache();
  }
  static async cacheKey(
    text: string,
    target: string,
    quality: Quality,
    provider: ProviderId,
  ): Promise<string> {
    return sha256Hex(`${provider}|${quality}|${target}|${text}`);
  }
}

export class TranslationManager {
  private opts: ManagerOptions;
  private rl = new RateLimiter();
  private mem = new TranslationMemory();
  private status: Map<ProviderId, ProviderStatus> = new Map();
  private pauseRequested = false;
  private currentProvider: ProviderId | null = null;

  constructor(opts: ManagerOptions) {
    this.opts = opts;
    const initial = loadProviderStatus();
    for (const s of initial) this.status.set(s.id, { ...s });
    if (!this.status.size) {
      this.status.set("deepseek", makeStatus("deepseek", "DeepSeek"));
      this.status.set("gemini", makeStatus("gemini", "Gemini"));
    }
  }

  pause() {
    this.pauseRequested = true;
  }

  resume() {
    this.pauseRequested = false;
  }

  isPaused() {
    return this.pauseRequested;
  }

  statuses(): ProviderStatus[] {
    return Array.from(this.status.values()).map((s) => {
      const suspendedUntil = this.rl.snapshot()[s.id];
      return { ...s, rateLimitedUntil: suspendedUntil };
    });
  }

  persist() {
    void saveProviderStatus(Array.from(this.status.values()));
  }

  async testAll(): Promise<ProviderStatus[]> {
    for (const cfg of this.opts.providers) {
      const client = PROVIDERS[cfg.id];
      const cur = this.status.get(cfg.id) ?? makeStatus(cfg.id, client.name);
      try {
        const res = await client.testConnection(cfg);
        cur.ok = res.ok;
        cur.message = res.message;
      } catch (err) {
        cur.ok = false;
        cur.message = err instanceof Error ? err.message : String(err);
      }
      this.status.set(cfg.id, cur);
    }
    this.persist();
    return this.statuses();
  }

  async translateChapter(args: {
    paragraphs: string[];
    contextHint?: string;
    onProgress?: (p: ManagedProgress) => void;
    checkPause?: () => Promise<void>;
    glossary?: GlossaryEntry[];
  }): Promise<{
    rows: string[];
    provider: ProviderId | null;
    failed: boolean;
  }> {
    const total = args.paragraphs.length;
    const rows: string[] = [];
    let failed = false;
    let providerUsed: ProviderId | null = null;
    args.onProgress?.({ done: 0, total, provider: null, index: 0 });

    if (this.pauseRequested) {
      await waitForResume(
        () => this.pauseRequested,
        () => args.checkPause?.(),
      );
    }

    // Translate paragraph-by-paragraph. Each paragraph gets its own API
    // call so the AI can focus on one passage at a time and the user sees
    // each translation stream in as it completes.
    for (let i = 0; i < total; i++) {
      if (this.pauseRequested) {
        await waitForResume(
          () => this.pauseRequested,
          () => args.checkPause?.(),
        );
      }
      // Honour the external stop signal so batch loops can cancel.
      if (args.checkPause) await args.checkPause();

      const translated = await this.runChunkWithFailover(
        [args.paragraphs[i]],
        args.contextHint,
        args.glossary,
      );
      if (translated.failed) {
        failed = true;
        rows.push(args.paragraphs[i]);
      } else {
        rows.push(translated.rows[0] ?? args.paragraphs[i]);
        if (!providerUsed) providerUsed = translated.provider;
        this.currentProvider = translated.provider;
      }

      args.onProgress?.({
        done: i + 1,
        total,
        provider: providerUsed,
        index: i,
      });
    }

    return { rows, provider: providerUsed, failed };
  }

  private async runChunkWithFailover(
    chunk: string[],
    contextHint?: string,
    glossary?: GlossaryEntry[],
  ): Promise<{
    rows: string[];
    provider: ProviderId | null;
    failed: boolean;
  }> {
    // Translate a single paragraph-array (normally just one paragraph now
    // that translateChapter sends them one at a time). Try preferred first,
    // then walk through fallback providers.
    const order = orderProviders(this.opts.preferred, this.opts.providers);
    const source = chunk[0];

    // Consult cache first.
    for (const cfg of order) {
      if (!cfg.enabled) continue;
      const key = await TranslationMemory.cacheKey(
        source,
        this.opts.target,
        this.opts.quality,
        cfg.id,
      );
      const hit = await this.mem.get(key);
      if (hit) {
        return { rows: [hit], provider: cfg.id, failed: false };
      }
    }

    for (const cfg of order) {
      if (!cfg.enabled) continue;
      if (cfg.id === "gemini" && !cfg.apiKey) continue;
      if (this.rl.isSuspended(cfg.id)) continue;
      const client = PROVIDERS[cfg.id];
      try {
        const req: TranslateRequest = {
          paragraphs: [source],
          source: this.opts.source,
          target: this.opts.target,
          quality: this.opts.quality,
          contextHint,
          glossary,
        };
        const res = await client.translate(cfg, req);
        const finalText = res.paragraphs[0] ?? source;
        // Write-through cache.
        const key = await TranslationMemory.cacheKey(
          source,
          this.opts.target,
          this.opts.quality,
          cfg.id,
        );
        await this.mem.put(key, finalText, cfg.id);
        const status = this.status.get(cfg.id);
        if (status) {
          status.ok = true;
          status.message = "OK";
          status.callCount++;
          status.lastUsed = Date.now();
        }
        this.persist();
        return { rows: [finalText], provider: cfg.id, failed: false };
      } catch (err) {
        const status = this.status.get(cfg.id);
        if (status) {
          status.ok = false;
          status.message = describeError(err);
          status.errorCount++;
        }
        const suspension = suspensionLength(err);
        if (suspension > 0) {
          this.rl.suspend(cfg.id, suspension);
        }
        await logCall({
          provider: cfg.id,
          ok: false,
          status: statusCode(err),
          message: describeError(err),
        });
        this.persist();
      }
    }
    return { rows: [source], provider: null, failed: true };
  }
}

function orderProviders(
  preferred: ProviderId,
  providers: ProviderConfig[],
): ProviderConfig[] {
  const sorted = [...providers];
  sorted.sort((a, b) => {
    if (a.id === preferred) return -1;
    if (b.id === preferred) return 1;
    return 0;
  });
  return sorted.filter((p) => p.enabled);
}

function makeStatus(id: ProviderId, name: string): ProviderStatus {
  return {
    id,
    name,
    ok: null,
    message: null,
    rateLimitedUntil: null,
    lastUsed: null,
    callCount: 0,
    errorCount: 0,
  };
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 240);
  return String(err).slice(0, 240);
}

function statusCode(err: unknown): number {
  if (err && typeof err === "object" && "status" in err) {
    return Number((err as { status: number }).status) || 0;
  }
  return 0;
}

function suspensionLength(err: unknown): number {
  const code = statusCode(err);
  if (code === 429) return 60_000;
  if (code === 529 || code === 503) return 30_000;
  if (code >= 500) return 15_000;
  if (code === 401 || code === 403) return 0; // Do not suspend — auth errors are config issues.
  return 0;
}

function waitForResume(
  isPaused: () => boolean,
  onCheck: () => Promise<void> | void,
): Promise<void> {
  return new Promise((resolve) => {
    const tick = async () => {
      if (!isPaused()) {
        resolve();
        return;
      }
      await onCheck();
      setTimeout(tick, 600);
    };
    void tick();
  });
}

async function logCall(args: {
  provider: ProviderId;
  ok: boolean;
  status: number;
  message: string;
}) {
  const { appendLog } = await import("../db");
  await appendLog({
    id: `${args.provider}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    provider: args.provider,
    ok: args.ok,
    status: args.status,
    message: args.message,
    at: Date.now(),
  });
}

function loadProviderStatus(): ProviderStatus[] {
  if (typeof window === "undefined") return [];
  try {
    return (window as unknown as { __atelierProviderStatus?: ProviderStatus[] })
      .__atelierProviderStatus ?? [];
  } catch {
    return [];
  }
}

async function saveProviderStatus(s: ProviderStatus[]) {
  if (typeof window === "undefined") return;
  (window as unknown as { __atelierProviderStatus?: ProviderStatus[] }).__atelierProviderStatus = s;
  try {
    await import("../db").then((m) => m.saveProviderStatus(s));
  } catch {
    /* ignore */
  }
}

// ── Provider tests (lightweight calls) ──────────────────────────────────

async function testDeepSeek(cfg: ProviderConfig) {
  // The proxy runs locally — send a trivial prompt to verify the roundtrip.
  const base = cfg.baseUrl?.replace(/\/$/, "") || "http://127.0.0.1:8001/v1";
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
        stream: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => r.statusText);
      return { ok: false, message: `${r.status}: ${text.slice(0, 100)}` };
    }
    return { ok: true, message: `Proxy at ${base} responded OK` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

async function testGemini(cfg: ProviderConfig) {
  if (!cfg.apiKey) return { ok: false, message: "API key missing" };
  try {
    const model = cfg.model || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}?key=${encodeURIComponent(cfg.apiKey)}`;
    const r = await fetch(url);
    if (!r.ok) {
      return { ok: false, message: `${r.status} ${r.statusText}` };
    }
    return { ok: true, message: "Gemini connection verified" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
