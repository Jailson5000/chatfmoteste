// Shared encryption utilities for sensitive data
// Uses AES-GCM encryption with the TOKEN_ENCRYPTION_KEY secret

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getKey(): Promise<CryptoKey> {
  const keyString = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!keyString) {
    throw new Error("TOKEN_ENCRYPTION_KEY not configured");
  }
  
  // Derive a proper 256-bit key from the secret using SHA-256
  const keyData = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(keyString)
  );
  
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey();
  
  // Generate random IV (12 bytes for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );
  
  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

export async function decryptToken(ciphertext: string): Promise<string> {
  const key = await getKey();
  
  // Decode base64
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  
  // Extract IV (first 12 bytes) and ciphertext
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted
  );
  
  return decoder.decode(decrypted);
}

// Helper to check if a token looks encrypted (base64 with proper length)
export function isEncrypted(token: string): boolean {
  if (!token) return false;
  // Encrypted tokens are base64 and have IV prefix, minimum ~40 chars
  try {
    const decoded = atob(token);
    return decoded.length >= 28; // 12 bytes IV + at least 16 bytes ciphertext
  } catch {
    return false;
  }
}
