// Client-side encryption for API keys stored in localStorage.
//
// Uses a synchronous stream cipher (XOR with a key derived from browser-stable
// entropy) rather than async Web Crypto API, because the settings hook uses
// React's useSyncExternalStore which requires synchronous getSnapshot.
//
// Security model: this protects against casual inspection of localStorage
// (someone reading the raw file, accidental exposure in screenshots/logs,
// backup file dumps). It does NOT protect against an attacker with access to
// the browser's JavaScript runtime — but neither would AES-GCM with a
// locally-derived key, since the key material is browser-accessible.
//
// Encrypted values: "ENC:<base64-iv>:<base64-ciphertext>"
// Plaintext values (pre-migration) lack the "ENC:" prefix and pass through.

const ENC_PREFIX = "ENC:";

// ── Key derivation (synchronous) ───────────────────────────────────────

function deriveKeyBytes(): Uint8Array {
  // Build a stable 32-byte key from browser fingerprint. We hash the
  // fingerprint through a simple DJB2-like mixing function to produce
  // a deterministic, well-distributed byte sequence.
  const fp = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth ?? 24,
    screen.width,
    screen.height,
    "atelier-studio-key-v3",
  ].join("|");

  const enc = new TextEncoder();
  const input = enc.encode(fp);

  // Simple but effective: use multiple rounds of a mixing function to
  // produce 32 bytes of key material from the fingerprint.
  const key = new Uint8Array(32);
  let h = 0x9e3779b9; // golden ratio constant
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < input.length; i++) {
      h = ((h << 5) + h) ^ input[i];
      h = ((h << 7) + h) ^ (round * 0x5bd1e995);
      // Mix into key
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

// ── Encrypt / Decrypt (synchronous XOR stream cipher) ──────────────────

export function encryptApiKey(plaintext: string): string {
  if (!plaintext) return "";
  const key = getKeyBytes();
  const enc = new TextEncoder();
  const bytes = enc.encode(plaintext);

  // Generate a random 12-byte "IV" — this is XORed into the key schedule
  // so identical plaintexts produce different ciphertexts.
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const result = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    // Mix IV byte into the key byte position for per-message uniqueness
    const keyByte = key[i % key.length] ^ iv[i % iv.length];
    result[i] = bytes[i] ^ keyByte;
  }

  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...result));
  return `${ENC_PREFIX}${ivB64}:${ctB64}`;
}

export function decryptApiKey(stored: string): string {
  if (!stored) return "";

  // Plaintext migration: values without the ENC prefix were stored before
  // encryption was added. Pass through so existing keys keep working.
  if (!stored.startsWith(ENC_PREFIX)) {
    return stored;
  }

  const payload = stored.slice(ENC_PREFIX.length);
  const colon = payload.indexOf(":");
  if (colon === -1) return ""; // corrupt record

  try {
    const key = getKeyBytes();
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
    // Decryption failed — likely browser/OS changed. Return empty.
    return "";
  }
}
