// Provider abstraction for the translation pipeline.
// Each provider exposes translate(...) and a lightweight test() ping.

import type {
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

    // Send the entire chapter in one API roundtrip. The previous chunked
    // implementation made paragraphs stream in 3-at-a-time, which produced
    // visible flicker on long chapters and a progress bar that jumped in
    // steps. With a single call the user sees a clean 0→total fill once.
    const translated = await this.runChunkWithFailover(
      args.paragraphs,
      args.contextHint,
    );
    if (translated.failed) {
      failed = true;
      for (let k = 0; k < args.paragraphs.length; k++) {
        rows.push(translated.rows[k] ?? args.paragraphs[k]);
      }
    } else {
      for (const row of translated.rows) rows.push(row);
      providerUsed = translated.provider;
      this.currentProvider = translated.provider;
    }

    args.onProgress?.({
      done: failed ? rows.length : total,
      total,
      provider: providerUsed,
      index: 0,
    });

    return { rows, provider: providerUsed, failed };
  }

  private async runChunkWithFailover(
    chunk: string[],
    contextHint?: string,
  ): Promise<{
    rows: string[];
    provider: ProviderId | null;
    failed: boolean;
  }> {
    // Try preferred first, then walk through others.
    const order = orderProviders(this.opts.preferred, this.opts.providers);
    // Consult cache for each paragraph first.
    const cached: (string | null)[] = [];
    for (const p of chunk) {
      const keyFor = (id: ProviderId) =>
        TranslationMemory.cacheKey(p, this.opts.target, this.opts.quality, id);
      // Try cache for any enabled provider, prefer the active one.
      let hit: string | null = null;
      for (const cfg of order) {
        if (!cfg.enabled) continue;
        const v = await this.mem.get(await keyFor(cfg.id));
        if (v) {
          hit = v;
          break;
        }
      }
      cached.push(hit);
    }
    const missingIndices = chunk
      .map((_, i) => i)
      .filter((i) => !cached[i]);

    if (missingIndices.length === 0) {
      return {
        rows: cached.map((c, i) => c ?? chunk[i]),
        provider: this.opts.preferred,
        failed: false,
      };
    }

    for (const cfg of order) {
      if (!cfg.enabled) continue;
      // DeepSeek doesn't need an API key; Gemini still does.
      if (cfg.id === "gemini" && !cfg.apiKey) continue;
      if (this.rl.isSuspended(cfg.id)) continue;
      const client = PROVIDERS[cfg.id];
      try {
        const req: TranslateRequest = {
          paragraphs: missingIndices.map((i) => chunk[i]),
          source: this.opts.source,
          target: this.opts.target,
          quality: this.opts.quality,
          contextHint,
        };
        const res = await client.translate(cfg, req);
        // Fill in fresh translations, write-through the cache.
        for (let k = 0; k < missingIndices.length; k++) {
          const translated = res.paragraphs[k];
          const source = chunk[missingIndices[k]];
          const finalText = translated ?? source;
          cached[missingIndices[k]] = finalText;
          const key = await TranslationMemory.cacheKey(
            source,
            this.opts.target,
            this.opts.quality,
            cfg.id,
          );
          await this.mem.put(key, finalText, cfg.id);
        }
        const status = this.status.get(cfg.id);
        if (status) {
          status.ok = true;
          status.message = "OK";
          status.callCount++;
          status.lastUsed = Date.now();
        }
        this.persist();
        return {
          rows: cached.map((c, i) => c ?? chunk[i]),
          provider: cfg.id,
          failed: false,
        };
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
        // Continue to next provider.
      }
    }
    // All providers fail — return source for missing paragraphs.
    return { rows: cached.map((c, i) => c ?? chunk[i]), provider: null, failed: true };
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
