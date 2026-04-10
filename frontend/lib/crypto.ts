const PBKDF2_ITERATIONS = 600_000;
const AES_KEY_LENGTH = 256;
const AES_GCM_IV_BYTES = 12;
const SALT_BYTES = 16;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

export function generateSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  window.crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

export async function deriveMasterKey(password: string, saltB64: string): Promise<CryptoKey> {
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(base64ToBytes(saltB64)),
      iterations: PBKDF2_ITERATIONS,
    },
    passwordKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportPublicKeyPem(publicKey: CryptoKey): Promise<string> {
  const spki = await window.crypto.subtle.exportKey("spki", publicKey);
  const b64 = bytesToBase64(new Uint8Array(spki));
  const chunks = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${chunks.join("\n")}\n-----END PUBLIC KEY-----`;
}

interface WrappedPrivateKeyPayload {
  iv: string;
  ciphertext: string;
}

interface HybridEncryptedPayload {
  scheme: "rsa_aes_gcm";
  wrapped_key: string;
  iv: string;
  ciphertext: string;
}

export async function wrapPrivateKey(
  privateKey: CryptoKey,
  masterKey: CryptoKey
): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("pkcs8", privateKey);
  const iv = new Uint8Array(AES_GCM_IV_BYTES);
  window.crypto.getRandomValues(iv);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    masterKey,
    exported
  );
  const payload: WrappedPrivateKeyPayload = {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(payload);
}

export async function unwrapPrivateKey(
  encryptedPrivateKey: string,
  masterKey: CryptoKey
): Promise<CryptoKey> {
  const payload = JSON.parse(encryptedPrivateKey) as WrappedPrivateKeyPayload;
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(base64ToBytes(payload.iv)),
    },
    masterKey,
    toArrayBuffer(base64ToBytes(payload.ciphertext))
  );
  return window.crypto.subtle.importKey(
    "pkcs8",
    decrypted,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["decrypt"]
  );
}

export async function decryptPIIMapping(
  encryptedMapping: Record<string, string>,
  privateKey: CryptoKey
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.entries(encryptedMapping).map(async ([token, encrypted]) => {
      const decrypted = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        toArrayBuffer(base64ToBytes(encrypted))
      );
      return [token, textDecoder.decode(decrypted)] as const;
    })
  );
  return Object.fromEntries(entries);
}

export async function decryptArchiveContent(
  encryptedContent: string,
  privateKey: CryptoKey
): Promise<string> {
  const payload = JSON.parse(encryptedContent) as HybridEncryptedPayload;
  if (payload.scheme !== "rsa_aes_gcm") {
    throw new Error("Unsupported archive encryption payload.");
  }

  const aesKeyBytes = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    toArrayBuffer(base64ToBytes(payload.wrapped_key))
  );
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    aesKeyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plaintext = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(base64ToBytes(payload.iv)),
    },
    aesKey,
    toArrayBuffer(base64ToBytes(payload.ciphertext))
  );
  return textDecoder.decode(plaintext);
}
