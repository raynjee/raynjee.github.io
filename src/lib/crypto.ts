// Client-side obfuscation for API keys stored in localStorage.
//
// Uses a synchronous stream cipher (XOR with a key derived from browser-stable
// entropy) rather than async Web Crypto API, because the settings hook uses
// React's useSyncExternalStore which requires synchronous getSnapshot.
//
// Encoding: hex (not base64) — avoids btoa/atob issues with arbitrary byte
// values in JavaScript strings.
//
// Obfuscated values: "ENC:<hex-iv>:<hex-ciphertext>"
// Plaintext values (pre-migration or legacy base64) pass through transparently.

const ENC_PREFIX = "ENC:";

// ── Key derivation (synchronous) ───────────────────────────────────────

function deriveKeyBytes(): Uint8Array {
  const fp = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth ?? 24,
    screen.width,
    screen.height,
    "anekdota-studio-key-v4",
  ].join("|");

  const enc = new TextEncoder();
  const input = enc.encode(fp);

  const key = new Uint8Array(32);
  let h = 0x9e3779b9;
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < input.length; i++) {
      h = ((h << 5) + h) ^ input[i];
      h = ((h << 7) + h) ^ (round * 0x5bd1e995);
      key[i % 32] ^= (h >>> ((i % 4) * 8)) & 0xff;
    }
  }
  return key;
}

let _keyBytes: Uint8Array | null = null;

function getKeyBytes(): Uint8Array {
  if (!_keyBytes) _keyBytes = deriveKeyBytes();
  return _keyBytes;
}

// ── Hex helpers ────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ── Encrypt / Decrypt (synchronous XOR stream cipher) ──────────────────

export function encryptApiKey(plaintext: string): string {
  if (!plaintext) return "";
  const key = getKeyBytes();
  const enc = new TextEncoder();
  const bytes = enc.encode(plaintext);

  // Random 12-byte IV so identical plaintexts produce different ciphertexts.
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const result = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[i] = bytes[i] ^ key[i % key.length] ^ iv[i % iv.length];
  }

  const ivHex = bytesToHex(iv);
  const ctHex = bytesToHex(result);
  return `${ENC_PREFIX}${ivHex}:${ctHex}`;
}

export function decryptApiKey(stored: string): string {
  if (!stored) return "";

  // Plaintext pass-through: values without the ENC prefix were stored
  // before obfuscation was added.
  if (!stored.startsWith(ENC_PREFIX)) {
    return stored;
  }

  const payload = stored.slice(ENC_PREFIX.length);
  const colon = payload.indexOf(":");
  if (colon === -1) {
    // Legacy: might be a malformed record. Return empty so the user
    // re-enters their key.
    console.warn("crypto: corrupt encrypted record (no colon separator)");
    return "";
  }

  try {
    const key = getKeyBytes();
    const ivHex = payload.slice(0, colon);
    const ctHex = payload.slice(colon + 1);

    // Detect legacy base64 format (contains +/= or / characters).
    // If detected, try the old btoa/atob path as a migration.
    if (/[+\/=]/.test(ivHex) || /[+\/=]/.test(ctHex)) {
      return decryptLegacyBase64(stored, key);
    }

    const iv = hexToBytes(ivHex);
    const ct = hexToBytes(ctHex);

    if (iv.length === 0 || ct.length === 0) {
      console.warn("crypto: empty IV or ciphertext in encrypted record");
      return "";
    }

    const result = new Uint8Array(ct.length);
    for (let i = 0; i < ct.length; i++) {
      result[i] = ct[i] ^ key[i % key.length] ^ iv[i % iv.length];
    }

    return new TextDecoder().decode(result);
  } catch (err) {
    console.warn("crypto: decryption failed", err);
    return "";
  }
}

// ── Legacy base64 migration ────────────────────────────────────────────

function decryptLegacyBase64(stored: string, key: Uint8Array): string {
  const payload = stored.slice(ENC_PREFIX.length);
  const colon = payload.indexOf(":");
  if (colon === -1) return "";

  try {
    const ivB64 = payload.slice(0, colon);
    const ctB64 = payload.slice(colon + 1);
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));

    const result = new Uint8Array(ct.length);
    for (let i = 0; i < ct.length; i++) {
      const keyByte = key[i % key.length] ^ iv[i % iv.length];
      result[i] = ct[i] ^ keyByte;
    }

    return new TextDecoder().decode(result);
  } catch {
    console.warn("crypto: legacy base64 decryption failed — key may be corrupted");
    return "";
  }
}
