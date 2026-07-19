// GitHub Gist sync — passphrase-based cross-device backup with encryption.
//
// The user picks a passphrase. Two independent derivations happen:
//   1. SHA-256 → short hex marker → Gist description (fast, for discovery)
//   2. PBKDF2 → AES-256-GCM key → encrypts the actual backup content
//
// The Gist contains a single file "atelier-backup.json". Its content is:
//   base64(salt) + ":" + base64(iv) + ":" + base64(ciphertext)
//
// This ensures GitHub's secret scanner cannot read the backup and flag
// API tokens that happen to match PAT-like patterns.
//
//   validateToken(token)            → test the GitHub token
//   connectSync(token, passphrase)   → find-or-create Gist, return gistId
//   pushBackup(token, gistId, pass)  → push encrypted backup
//   pullBackup(token, gistId, pass)  → pull + decrypt backup
//
// pullBackup also handles legacy (pre-encryption) Gists that contain
// plain JSON — it will restore those without a passphrase.

import { buildBackup, restoreBackup } from "./db";
import type { StudioBackup } from "./db";

const GIST_API = "https://api.github.com/gists";
const GIST_FILENAME = "atelier-backup.json";
const DESCRIPTION_PREFIX = "atelier-sync-";

// PBKDF2 parameters (tuned for ~200ms on modern hardware)
const PBKDF2_ITERATIONS = 250_000;
const SALT_LENGTH = 16; // bytes
const IV_LENGTH = 12; // bytes (AES-GCM standard)
const AES_KEY_LENGTH = 256; // bits

export interface SyncResult {
  ok: boolean;
  message: string;
  syncedAt: number;
}

export interface ConnectResult extends SyncResult {
  gistId?: string;
}

// ── Token validation ──────────────────────────────────────────────────

export async function validateToken(
  rawToken: string,
): Promise<{ ok: boolean; message: string }> {
  const token = rawToken.trim();
  if (!token) return { ok: false, message: "No token provided." };
  if (!token.startsWith("ghp_") && !token.startsWith("github_pat_")) {
    return {
      ok: false,
      message: `Token doesn't look right — expected ghp_ or github_pat_ prefix, got "${token.slice(0, 6)}…"`,
    };
  }
  try {
    const res = await fetch(GIST_API + "?per_page=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (userRes.ok) {
        const user = (await userRes.json()) as { login: string };
        return { ok: true, message: `Valid — logged in as @${user.login}` };
      }
      return { ok: true, message: "Token works with Gist API." };
    }
    if (res.status === 401) {
      return {
        ok: false,
        message:
          "Token rejected (401). Create a CLASSIC token at github.com/settings/tokens with the 'gist' scope.",
      };
    }
    if (res.status === 403) {
      return {
        ok: false,
        message: "Token valid but lacks Gist permission (403). Check the gist scope.",
      };
    }
    const body = await res.text().catch(() => "");
    return { ok: false, message: `Unexpected ${res.status}: ${body.slice(0, 100)}` };
  } catch {
    return { ok: false, message: "Network error — check your connection." };
  }
}

// ── Passphrase hashing (discovery marker) ─────────────────────────────

export async function hashPassphrase(passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(passphrase);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

// ── Encryption key derivation (PBKDF2) ────────────────────────────────

async function deriveEncryptionKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase).buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────

async function encryptContent(
  passphrase: string,
  plaintext: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveEncryptionKey(passphrase, salt);

  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    encoder.encode(plaintext).buffer as ArrayBuffer,
  );

  // Format: base64(salt) + ":" + base64(iv) + ":" + base64(ciphertext)
  return [
    bytesToBase64(salt),
    bytesToBase64(iv),
    bytesToBase64(new Uint8Array(ciphertext)),
  ].join(":");
}

async function decryptContent(
  passphrase: string,
  payload: string,
): Promise<string> {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new DecryptError("Malformed encrypted payload — expected salt:iv:ciphertext");
  }

  const salt = base64ToBytes(parts[0]);
  const iv = base64ToBytes(parts[1]);
  const ciphertext = base64ToBytes(parts[2]);

  if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH) {
    throw new DecryptError("Invalid salt or IV length — data may be corrupted");
  }

  const key = await deriveEncryptionKey(passphrase, salt);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new DecryptError(
      "Wrong passphrase — cannot decrypt. Make sure you're using the same passphrase as when you first connected.",
    );
  }
}

class DecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptError";
  }
}

// ── Find or create the sync Gist ──────────────────────────────────────

async function findSyncGist(
  rawToken: string,
  passphrase: string,
): Promise<{ gistId: string } | null> {
  const token = rawToken.trim();
  const marker = DESCRIPTION_PREFIX + (await hashPassphrase(passphrase));

  const res = await fetch(`${GIST_API}?per_page=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) return null;

  const gists = (await res.json()) as Array<{ id: string; description: string }>;
  const match = gists.find((g) => (g.description ?? "").includes(marker));
  return match ? { gistId: match.id } : null;
}

async function createSyncGist(
  rawToken: string,
  passphrase: string,
): Promise<ConnectResult> {
  const token = rawToken.trim();
  if (!token) {
    return { ok: false, message: "GitHub token not configured.", syncedAt: 0 };
  }

  const marker = DESCRIPTION_PREFIX + (await hashPassphrase(passphrase));

  try {
    const backup = await buildBackup();
    const plaintext = JSON.stringify(backup, null, 2);
    const encrypted = await encryptContent(passphrase, plaintext);

    const res = await fetch(GIST_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: `${marker} — Ἀνέκδοτα backup (encrypted)`,
        public: false,
        files: { [GIST_FILENAME]: { content: encrypted } },
      }),
    });

    if (!res.ok) {
      const text = await safeText(res);
      return {
        ok: false,
        message: `GitHub API error ${res.status}: ${text.slice(0, 200)}`,
        syncedAt: 0,
      };
    }

    const data = (await res.json()) as GistResponse;
    return {
      ok: true,
      message: "Connected — sync Gist ready (encrypted).",
      syncedAt: Date.now(),
      gistId: data.id,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Network error: ${err instanceof Error ? err.message : "unknown"}`,
      syncedAt: 0,
    };
  }
}

export async function connectSync(
  rawToken: string,
  passphrase: string,
): Promise<ConnectResult> {
  const token = rawToken.trim();
  if (!token || !passphrase) {
    return {
      ok: false,
      message: "Enter your GitHub token and passphrase.",
      syncedAt: 0,
    };
  }

  // Try to find an existing Gist with this passphrase marker.
  const existing = await findSyncGist(token, passphrase);
  if (existing) {
    return {
      ok: true,
      message: "Found existing sync Gist.",
      syncedAt: Date.now(),
      gistId: existing.gistId,
    };
  }

  // Not found — create a new one.
  return createSyncGist(token, passphrase);
}

// ── Push / Pull (work with a known gistId) ────────────────────────────

export async function pushBackup(
  rawToken: string,
  gistId: string,
  passphrase: string,
): Promise<SyncResult> {
  const token = rawToken.trim();
  if (!token || !gistId) {
    return { ok: false, message: "Gist token or ID not configured.", syncedAt: 0 };
  }
  if (!passphrase) {
    return { ok: false, message: "Passphrase required to encrypt backup.", syncedAt: 0 };
  }

  try {
    const backup = await buildBackup();
    const plaintext = JSON.stringify(backup, null, 2);
    const encrypted = await encryptContent(passphrase, plaintext);

    const res = await fetch(`${GIST_API}/${gistId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: { [GIST_FILENAME]: { content: encrypted } },
      }),
    });

    if (!res.ok) {
      const text = await safeText(res);
      return {
        ok: false,
        message: `GitHub API error ${res.status}: ${text.slice(0, 200)}`,
        syncedAt: 0,
      };
    }

    const syncedAt = Date.now();
    return {
      ok: true,
      message: `Synced (${formatSize(plaintext.length)}, encrypted)`,
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

export async function pullBackup(
  rawToken: string,
  gistId: string,
  passphrase: string,
): Promise<SyncResult> {
  const token = rawToken.trim();
  if (!token || !gistId) {
    return { ok: false, message: "Gist token or ID not configured.", syncedAt: 0 };
  }

  try {
    const res = await fetch(`${GIST_API}/${gistId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (res.status === 404) {
      return {
        ok: false,
        message: "Sync Gist not found. Reconnect with your passphrase.",
        syncedAt: 0,
      };
    }

    if (!res.ok) {
      const text = await safeText(res);
      return {
        ok: false,
        message: `GitHub API error ${res.status}: ${text.slice(0, 200)}`,
        syncedAt: 0,
      };
    }

    const data = (await res.json()) as GistResponse;
    const file = data.files?.[GIST_FILENAME];
    if (!file?.content) {
      return {
        ok: false,
        message: "Gist found but backup file is missing. Push first.",
        syncedAt: 0,
      };
    }

    const raw = file.content;

    // ── Try decryption first, fall back to legacy plain JSON ──────────
    let parsed: StudioBackup;

    if (raw.startsWith("{") || raw.startsWith("[")) {
      // Legacy unencrypted format (pre-passphrase-encryption)
      try {
        parsed = JSON.parse(raw) as StudioBackup;
      } catch {
        return { ok: false, message: "Gist file is not valid JSON.", syncedAt: 0 };
      }
    } else {
      // Encrypted format: salt:iv:ciphertext (base64)
      if (!passphrase) {
        return {
          ok: false,
          message:
            "This Gist uses encrypted backups. Enter your passphrase in Settings first.",
          syncedAt: 0,
        };
      }
      try {
        const plaintext = await decryptContent(passphrase, raw);
        parsed = JSON.parse(plaintext) as StudioBackup;
      } catch (err) {
        if (err instanceof DecryptError) {
          return { ok: false, message: err.message, syncedAt: 0 };
        }
        return {
          ok: false,
          message: "Failed to parse decrypted backup — data may be corrupted.",
          syncedAt: 0,
        };
      }
    }

    if (!parsed.version || !Array.isArray(parsed.books)) {
      return { ok: false, message: "Gist file is not a valid backup.", syncedAt: 0 };
    }

    await restoreBackup(parsed);
    return {
      ok: true,
      message: `Restored ${parsed.books.length} book(s) from Gist.`,
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

// ── Base64 helpers ────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── API helpers ───────────────────────────────────────────────────────

interface GistResponse {
  id: string;
  files?: Record<string, { filename: string; content?: string }>;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
