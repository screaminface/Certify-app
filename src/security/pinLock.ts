/**
 * PIN Lock Security Module
 * Handles hashing, verification, and storage of the App Lock PIN.
 * 
 * SECURITY NOTE:
 * This is a "Light App Lock" implementation. It protects the UI from casual access.
 * Since the PIN (4 digits) has low entropy, and the hash is stored client-side,
 * it does not provide cryptographic-grade protection against a determined attacker
 * who has physical access to the device file system (keys can be extracted/brute-forced).
 * 
 * However, it effectively stops unauthorized users from opening the app on an unlocked device.
 */

// Configuration
const PIN_ITERATIONS = 300000; // Higher iterations for PINs due to low entropy (4 digits)
const PIN_SALT_LENGTH = 16; // bytes
const PIN_HASH_ALGO = 'SHA-256';
const PIN_KEY_LENGTH = 256;
const PIN_STORAGE_KEY = 'app_pin_config';

export interface PinConfig {
  version: number;
  hash: string; // Base64
  salt: string; // Base64
  algo: string;
  createdAt: string;
}

// Helpers
function bufferToBase64(buf: ArrayBufferLike): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  try {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    throw new Error('Invalid Base64 string');
  }
}

/**
 * Generates a PBKDF2 hash for a given PIN.
 * If salt is provided, it uses it (for verification).
 * If not, it generates a new random salt (for setup).
 */
export async function hashPin(pin: string, existingSaltBase64?: string): Promise<{ hash: string; salt: string }> {
  let salt: Uint8Array;

  if (existingSaltBase64) {
    salt = base64ToBuffer(existingSaltBase64);
  } else {
    salt = window.crypto.getRandomValues(new Uint8Array(PIN_SALT_LENGTH));
  }

  const enc = new TextEncoder();
  
  // 1. Import PIN as key
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  // 2. Derive Key (Hash)
  // We use deriveKey to get a structured hash akin to our crypto utils, 
  // or deriveBits. deriveBits is sufficient for just a hash comparison.
  // Let's use deriveBits for simplicity in storage.
  const hashBuffer = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: PIN_ITERATIONS,
      hash: PIN_HASH_ALGO
    },
    keyMaterial,
    PIN_KEY_LENGTH
  );

  return {
    hash: bufferToBase64(hashBuffer),
    salt: bufferToBase64(salt.buffer)
  };
}

/**
 * Verifies if the entered PIN matches the stored config.
 */
export async function verifyPin(pin: string, config: PinConfig): Promise<boolean> {
  try {
    const { hash } = await hashPin(pin, config.salt);
    return hash === config.hash;
  } catch (error) {
    console.error("PIN verification failed:", error);
    return false;
  }
}

/**
 * Saves the PIN configuration to local storage.
 */
export function savePinConfig(config: PinConfig): void {
  localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(config));
}

/**
 * Retrieves the PIN configuration from local storage.
 */
export function getPinConfig(): PinConfig | null {
  const raw = localStorage.getItem(PIN_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PinConfig;
  } catch (e) {
    return null;
  }
}

/**
 * Removes the PIN configuration (disabling the lock).
 */
export function clearPinConfig(): void {
  localStorage.removeItem(PIN_STORAGE_KEY);
}

/**
 * Checks if the app is currently configured to be locked.
 */
export function isPinSet(): boolean {
  return !!localStorage.getItem(PIN_STORAGE_KEY);
}
