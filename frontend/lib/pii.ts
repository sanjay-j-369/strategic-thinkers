"use client";

import { apiFetch } from "@/lib/api";
import { decryptPIIMapping } from "@/lib/crypto";

const PII_TOKEN_PATTERN = /<[A-Z_]+_[a-f0-9]+>/g;

interface ResolvePIIResponse {
  pii_mapping_enc?: Record<string, string>;
  pii_mapping_plain?: Record<string, string>;
  pii_mapping_scheme?: Record<string, string>;
}

export function extractPIITokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.match(PII_TOKEN_PATTERN) || [];
}

export function replacePIITokens(
  value: string | null | undefined,
  mapping: Record<string, string>
): string {
  if (!value) return value || "";
  let resolved = value;
  for (const [token, plain] of Object.entries(mapping)) {
    resolved = resolved.replaceAll(token, plain);
  }
  return resolved;
}

export async function resolvePIITokenValues(
  tokens: string[],
  authToken: string,
  privateKey: CryptoKey | null
): Promise<Record<string, string>> {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (uniqueTokens.length === 0) return {};

  const data = await apiFetch<ResolvePIIResponse>("/api/archive/pii/resolve", {
    method: "POST",
    token: authToken,
    json: { tokens: uniqueTokens },
  });

  const plain = { ...(data.pii_mapping_plain || {}) };
  const scheme = data.pii_mapping_scheme || {};
  const encrypted = data.pii_mapping_enc || {};
  const rsaTokens = Object.fromEntries(
    Object.entries(encrypted).filter(([token]) => scheme[token] === "rsa_oaep")
  );

  if (Object.keys(rsaTokens).length > 0 && privateKey) {
    const decrypted = await decryptPIIMapping(rsaTokens, privateKey);
    Object.assign(plain, decrypted);
  }

  return plain;
}
