export interface EncryptedBackup {
  version: number;
  salt: string; // Base64
  iv: string;   // Base64
  ciphertext: string; // Base64
  kdf: string; // "PBKDF2-SHA256"
  iterations?: number; // Optional for backward compatibility
}

// Configuration Constants
const PBKDF2_ITERATIONS = 100000;
const MIN_ITERATIONS = 50000;
const MAX_ITERATIONS = 2000000; // 2 Million
const SALT_LENGTH = 16; // bytes
const IV_LENGTH = 12;   // bytes (standard for AES-GCM)
const KEY_LENGTH = 256; // bits

/**
 * Validates and normalizes the iteration count to prevent DoS and ensure backward compatibility
 */
function normalizeIterations(v: unknown): number {
  // 1. Strict backward compatibility: ONLY if undefined/null take the default
  if (v === undefined || v === null) {
    return PBKDF2_ITERATIONS;
  }

  // 2. Validate Type: Must be a finite integer
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
    throw new Error("Invalid backup format: iterations must be a valid integer.");
  }

  // 3. Guard Rails: Prevent DoS (too high) or insecurity (too low)
  if (v < MIN_ITERATIONS || v > MAX_ITERATIONS) {
    throw new Error(`Invalid backup format: iterations must be between ${MIN_ITERATIONS} and ${MAX_ITERATIONS}.`);
  }

  return v;
}

/**
 * Converts a string to an ArrayBuffer
 */
function str2ab(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Converts an ArrayBuffer to a string
 */
function ab2str(buf: ArrayBuffer): string {
  return new TextDecoder().decode(buf);
}

/**
 * Converts an ArrayBuffer to Base64 string efficiently
 */
function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  const len = bytes.byteLength;
  const chunk_size = 8192;
  
  for (let i = 0; i < len; i += chunk_size) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk_size) as any);
  }
  return window.btoa(binary);
}

/**
 * Converts Base64 string to Uint8Array efficiently
 */
function base64ToBuffer(base64: string): Uint8Array {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives an AES-GCM key from a password and salt using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array, iterations: number = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const enc = new TextEncoder();
  
  // 1. Import password as a key for PBKDF2
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  // 2. Derive the AES-GCM key
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: iterations,
      hash: "SHA-256"
    },
    passwordKey,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a JSON object into a secure, password-protected format
 */
export async function encryptBackupJson(data: any, password: string): Promise<EncryptedBackup> {
  // 1. Prepare data
  const plainText = JSON.stringify(data);
  const encodedData = str2ab(plainText);

  // 2. Generate Random Salt and IV
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // 3. Derive Key
  // We use the current constant for encryption
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);

  // 4. Encrypt
  const encryptedContent = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as any
    },
    key,
    encodedData as any
  );

  // 5. Package Result
  return {
    version: 1,
    kdf: "PBKDF2-SHA256",
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(encryptedContent),
    iterations: PBKDF2_ITERATIONS
  };
}

/**
 * Decrypts an encrypted backup object back into the original JSON data
 * Throws error if password is wrong or integrity check fails
 */
export async function decryptBackupJson<T>(encryptedBackup: EncryptedBackup, password: string): Promise<T> {
  try {
    // 1. Decode Salt and IV
    const salt = base64ToBuffer(encryptedBackup.salt);
    const iv = base64ToBuffer(encryptedBackup.iv);
    const ciphertext = base64ToBuffer(encryptedBackup.ciphertext);

    // 2. Get Iterations with Strict Validation
    const iterations = normalizeIterations(encryptedBackup.iterations);

    // 3. Derive Key
    const key = await deriveKey(password, salt, iterations);

    // 4. Decrypt
    // AES-GCM handles integrity checking automatically. 
    // If the password is wrong (wrong key) or data tampered, this throws an error.
    const decryptedContent = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv as any
      },
      key,
      ciphertext as any
    );

    // 4. Parse JSON
    const decodedString = ab2str(decryptedContent);
    return JSON.parse(decodedString) as T;
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error("Decryption failed. Wrong password or corrupted file.");
  }
}

/**
 * Type Guard to check if an object is an EncryptedBackup
 */
export function isEncryptedBackup(obj: any): obj is EncryptedBackup {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'ciphertext' in obj &&
    'salt' in obj &&
    'iv' in obj &&
    'version' in obj
  );
}
