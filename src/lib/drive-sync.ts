// Google Drive sync — one-click cross-device backup via your Google account.
//
// Uses the modern Google Identity Services (GIS) library for OAuth 2.0
// and raw fetch() calls to the Drive API. The backup lives in the Drive
// appDataFolder — invisible to you in normal Drive view, accessible only
// to this app. No tokens to create, no passphrases to remember, no
// secret scanners to worry about.
//
//   initDriveClient(clientId)    → load GIS script, return ready status
//   connectDrive(clientId)        → OAuth popup, get token, store email
//   pushToDrive(clientId)         → upload backup to appDataFolder
//   pullFromDrive(clientId)       → download + restore from appDataFolder
//   disconnectDrive()             → revoke token, forget connection
//
// Access tokens expire after ~1 hour. When a Drive API call returns 401,
// we silently request a fresh token via GIS (no popup if user already
// granted). The token is stored in memory only — we never persist it.

import { buildBackup, restoreBackup } from "./db";
import type { StudioBackup } from "./db";

// ── Google Identity Services type declarations ─────────────────────────

declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenClientConfig {
        client_id: string;
        scope: string;
        callback: string | ((response: TokenResponse) => void);
        prompt?: string;
        error_callback?: (error: { type: string; message: string }) => void;
      }
      interface TokenResponse {
        access_token: string;
        error?: string;
        error_description?: string;
        expires_in: string;
        scope: string;
        token_type: string;
      }
      interface OverridableTokenClientConfig {
        prompt?: string;
      }
      interface TokenClient {
        requestAccessToken(
          config?: OverridableTokenClientConfig,
        ): void;
        callback: string | ((response: TokenResponse) => void);
      }
      function initTokenClient(config: TokenClientConfig): TokenClient;
      function hasGrantedAllScopes(
        token: string,
        ...scopes: string[]
      ): boolean;
      function revoke(scope: string, callback: () => void): void;
    }
  }
}

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const BACKUP_FILENAME = "anekdota-backup.json";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

// ── Result types ──────────────────────────────────────────────────────

export interface DriveSyncResult {
  ok: boolean;
  message: string;
  syncedAt: number;
}

export interface DriveConnectResult extends DriveSyncResult {
  email?: string;
}

// ── Module state ──────────────────────────────────────────────────────

// tokenClient is created fresh per-request — no need to cache
let gisLoaded = false;
let gisLoadPromise: Promise<void> | null = null;

// ── Token cache (sessionStorage) ─────────────────────────────────────
// Caches the access token so push/pull don't require re-auth within ~1h.
// sessionStorage is per-tab and cleared on close — safe enough for tokens.

const TOKEN_CACHE_KEY = "anekdota.drive.token";
const TOKEN_EXPIRY_KEY = "anekdota.drive.tokenExpiry";

function getCachedToken(): string | null {
  try {
    const token = sessionStorage.getItem(TOKEN_CACHE_KEY);
    const expiry = sessionStorage.getItem(TOKEN_EXPIRY_KEY);
    if (token && expiry && Date.now() < Number(expiry)) return token;
  } catch { /* not available */ }
  return null;
}

function cacheToken(token: string, expiresIn: string): void {
  try {
    sessionStorage.setItem(TOKEN_CACHE_KEY, token);
    // Tokens expire in ~3600 s — expire our cache 5 min early
    const ttl = (Number(expiresIn) - 300) * 1000;
    sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + ttl));
  } catch { /* quota exceeded or private browsing */ }
}

function clearTokenCache(): void {
  try {
    sessionStorage.removeItem(TOKEN_CACHE_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
  } catch { /* best effort */ }
}

// ── GIS script loading ────────────────────────────────────────────────

async function loadGisScript(): Promise<void> {
  if (gisLoaded) return;
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    // Check if already loaded by another call
    if (typeof google !== "undefined" && google?.accounts?.oauth2) {
      gisLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      gisLoaded = true;
      resolve();
    };
    script.onerror = () => {
      gisLoadPromise = null;
      reject(new Error("Failed to load Google Identity Services script."));
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

// ── Token client init ─────────────────────────────────────────────────

// getTokenClient is no longer used — requestToken creates fresh clients.
// Kept for backward compatibility if referenced elsewhere.
function getTokenClient(clientId: string): google.accounts.oauth2.TokenClient {
  return google.accounts.oauth2.initTokenClient({
    client_id: clientId.trim(),
    scope: DRIVE_SCOPE,
    callback: () => {},
  });
}

// ── Obtain an access token ────────────────────────────────────────────

function requestToken(
  clientId: string,
  prompt: "" | "consent" = "",
): Promise<string | null> {
  // If asking silently and we have a cached token, return it instantly.
  // This avoids unnecessary GIS round-trips on every push/pull.
  if (prompt !== "consent") {
    const cached = getCachedToken();
    if (cached) return Promise.resolve(cached);
  }

  return new Promise((resolve) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: DRIVE_SCOPE,
      callback: (response: google.accounts.oauth2.TokenResponse) => {
        clearTimeout(timeout);
        if (response.error) {
          console.error("Drive auth error:", response.error, response.error_description || "");
          resolve(null);
          return;
        }
        // Cache the fresh token so we don't need to re-auth for ~1h
        if (response.access_token && response.expires_in) {
          cacheToken(response.access_token, response.expires_in);
        }
        resolve(response.access_token);
      },
      error_callback: (error: { type: string; message: string }) => {
        clearTimeout(timeout);
        console.error("Drive auth error callback:", error.type, error.message);
        resolve(null);
      },
    });

    const timeout = setTimeout(() => {
      resolve(null);
    }, 30_000);

    try {
      client.requestAccessToken({ prompt });
    } catch (e) {
      clearTimeout(timeout);
      console.error("Failed to request Drive token:", e);
      resolve(null);
    }
  });
}

// ── Fetch wrapper with auto-retry on 401 ──────────────────────────────

async function driveFetch(
  clientId: string,
  url: string,
  options: RequestInit & { token?: string } = {},
): Promise<Response> {
  const makeReq = (token: string) =>
    fetch(url, {
      ...options,
      headers: {
        ...(options.headers as Record<string, string>),
        Authorization: `Bearer ${token}`,
      },
    });

  // Try with provided token first
  if (options.token) {
    const res = await makeReq(options.token);
    if (res.status !== 401) return res;
    // Token expired — fall through to silent refresh
  }

  // Silent refresh first, then consent if needed (user already initiated action)
  let fresh = await requestToken(clientId, "");
  if (!fresh) fresh = await requestToken(clientId, "consent");
  if (!fresh) throw new Error("Could not obtain Drive access token.");
  return makeReq(fresh);
}

// ── Retry helper for flaky mobile networks ───────────────────────────

async function retryFetch(
  fn: () => Promise<Response>,
  attempts = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fn();
      // Only retry on server errors (5xx) and network failures — not 4xx
      if (res.status < 500) return res;
      lastErr = new Error(`Server error ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
  throw lastErr;
}

// ── Find existing backup file in appDataFolder ─────────────────────────

async function findBackupFile(
  clientId: string,
  token: string,
): Promise<{ fileId: string } | null> {
  const q = encodeURIComponent(
    `name='${BACKUP_FILENAME}' and 'appDataFolder' in parents`,
  );
  const res = await driveFetch(
    clientId,
    `${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=files(id,name)`,
    { token },
  );

  if (!res.ok) return null;
  const data = (await res.json()) as {
    files?: Array<{ id: string; name: string }>;
  };
  const match = data.files?.find((f) => f.name === BACKUP_FILENAME);
  return match ? { fileId: match.id } : null;
}

// ── Public API ────────────────────────────────────────────────────────

export async function initDriveClient(
  clientId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!clientId.trim()) {
    return { ok: false, message: "Enter a Google Cloud client ID first." };
  }
  try {
    await loadGisScript();
    return { ok: true, message: "Google Identity Services ready." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to load Google auth.",
    };
  }
}

export async function connectDrive(
  clientId: string,
): Promise<DriveConnectResult> {
  if (!clientId.trim()) {
    return {
      ok: false,
      message: "Google Client ID not configured.",
      syncedAt: 0,
    };
  }

  try {
    await loadGisScript();
  } catch {
    return {
      ok: false,
      message: "Failed to load Google sign-in. Check your connection.",
      syncedAt: 0,
    };
  }

  // Force consent prompt so user can pick account (even if previously granted)
  const token = await requestToken(clientId, "consent");
  if (!token) {
    return {
      ok: false,
      message:
        "Sign-in popup was blocked or closed. On iPhone: Settings > Safari > turn off Block Pop-ups. On desktop: click the popup-blocked icon in the address bar and allow popups.",
      syncedAt: 0,
    };
  }

  // Fetch user email for display
  let email = "";
  try {
    const res = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const info = (await res.json()) as { email: string };
      email = info.email ?? "";
    }
  } catch {
    // non-critical
  }

  return {
    ok: true,
    message: email ? `Connected as ${email}` : "Connected to Google Drive.",
    syncedAt: Date.now(),
    email,
  };
}

export async function pushToDrive(
  clientId: string,
): Promise<DriveSyncResult> {
  if (!clientId.trim()) {
    return {
      ok: false,
      message: "Google Client ID not configured.",
      syncedAt: 0,
    };
  }

  try {
    await loadGisScript();
  } catch {
    return {
      ok: false,
      message: "Google auth not available.",
      syncedAt: 0,
    };
  }

  try {
    const backup = await buildBackup();
    const content = JSON.stringify(backup, null, 2);

    // Try silent token first (works if user already granted consent).
    // If that fails, fall back to consent prompt — the user clicked Push,
    // so a popup is expected and browsers won't block it.
    let token = await requestToken(clientId, "");
    if (!token) {
      token = await requestToken(clientId, "consent");
    }
    if (!token) {
      return {
        ok: false,
        message:
          "Could not authenticate. Allow pop-ups for this site, then try Connect first.",
        syncedAt: 0,
      };
    }

    // Check for existing file
    const existing = await findBackupFile(clientId, token);

    if (existing) {
      // Update existing file
      const res = await retryFetch(() => driveFetch(
        clientId,
        `${DRIVE_UPLOAD}/files/${existing.fileId}?uploadType=media`,
        {
          method: "PATCH",
          token,
          headers: { "Content-Type": "application/json" },
          body: content,
        },
      ));

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          message: `Drive API error ${res.status}: ${text.slice(0, 200)}`,
          syncedAt: 0,
        };
      }
    } else {
      // Create new file with multipart upload
      const metadata = {
        name: BACKUP_FILENAME,
        parents: ["appDataFolder"],
      };

      const boundary = "anekdota_" + Date.now();
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        "",
        `--${boundary}`,
        "Content-Type: application/json",
        "",
        content,
        `--${boundary}--`,
      ].join("\r\n");

      const res = await retryFetch(() => driveFetch(
        clientId,
        `${DRIVE_UPLOAD}/files?uploadType=multipart`,
        {
          method: "POST",
          token,
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      ));

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          message: `Drive API error ${res.status}: ${text.slice(0, 200)}`,
          syncedAt: 0,
        };
      }
    }

    const syncedAt = Date.now();
    return {
      ok: true,
      message: `Synced to Drive (${formatSize(content.length)})`,
      syncedAt,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Network error: ${err instanceof Error ? err.message : "unknown"}`,
      syncedAt: 0,
    };
  }
}

export async function pullFromDrive(
  clientId: string,
): Promise<DriveSyncResult> {
  if (!clientId.trim()) {
    return {
      ok: false,
      message: "Google Client ID not configured.",
      syncedAt: 0,
    };
  }

  try {
    await loadGisScript();
  } catch {
    return {
      ok: false,
      message: "Google auth not available.",
      syncedAt: 0,
    };
  }

  try {
    // Try silent token first, fall back to consent if needed.
    let token = await requestToken(clientId, "");
    if (!token) {
      token = await requestToken(clientId, "consent");
    }
    if (!token) {
      return {
        ok: false,
        message:
          "Could not authenticate. Allow pop-ups for this site, then try Connect first.",
        syncedAt: 0,
      };
    }

    const existing = await findBackupFile(clientId, token);
    if (!existing) {
      return {
        ok: false,
        message: "No backup found in Drive. Push from another device first.",
        syncedAt: 0,
      };
    }

    // Download file content
    const res = await driveFetch(
      clientId,
      `${DRIVE_API}/files/${existing.fileId}?alt=media`,
      { token },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        message: `Drive API error ${res.status}: ${text.slice(0, 200)}`,
        syncedAt: 0,
      };
    }

    const raw = await res.text();
    let parsed: StudioBackup;
    try {
      parsed = JSON.parse(raw) as StudioBackup;
    } catch {
      return {
        ok: false,
        message: "Drive backup is not valid JSON.",
        syncedAt: 0,
      };
    }

    if (!parsed.version || !Array.isArray(parsed.books)) {
      return {
        ok: false,
        message: "Drive backup is not a valid backup.",
        syncedAt: 0,
      };
    }

    await restoreBackup(parsed);
    return {
      ok: true,
      message: `Restored ${parsed.books.length} book(s) from Drive.`,
      syncedAt: Date.now(),
    };
  } catch (err) {
    return {
      ok: false,
      message: `Network error: ${err instanceof Error ? err.message : "unknown"}`,
      syncedAt: 0,
    };
  }
}

export async function disconnectDrive(): Promise<{ ok: boolean; message: string }> {
  // Revoke token via Google's revoke endpoint
  try {
    const token = await requestToken("", ""); // won't work but tries to clear
    if (token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
        method: "POST",
      });
    }
  } catch {
    // best effort
  }

  // Clear token cache
  clearTokenCache();

  // Clear GIS state
  if (typeof google !== "undefined" && google?.accounts?.oauth2?.revoke) {
    try {
      google.accounts.oauth2.revoke(DRIVE_SCOPE, () => {});
    } catch {
      // ignore
    }
  }

  return { ok: true, message: "Disconnected from Google Drive." };
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
