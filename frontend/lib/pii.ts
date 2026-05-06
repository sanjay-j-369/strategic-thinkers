"use client";

import { apiFetch } from "@/lib/api";
import { decryptPIIMapping } from "@/lib/crypto";

const PII_TOKEN_PATTERN = /<[A-Z_]+_[a-f0-9]+>/g;
const PLACEHOLDER_PATTERN = /<(?:PERSON(?:_[a-f0-9]+)?|NAME|USER|EMAIL|PHONE|RECIPIENT|SENDER|STAKEHOLDER|CONTACT)>/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;
const SHORT_PHONE_PATTERN = /\b\d{3}[\s.-]\d{4}\b/g;
const PERSON_PATTERN = /\b(?:[A-Z][a-z]+|[A-Z][a-z]+'[A-Z][a-z]+)(?:\s+(?:[A-Z][a-z]+|[A-Z][a-z]+'[A-Z][a-z]+)){1,3}\b/g;
const PERSON_FALSE_STARTS = new Set([
  "A",
  "An",
  "And",
  "As",
  "Call",
  "Contact",
  "From",
  "Hello",
  "Meeting",
  "No",
  "Please",
  "Subject",
  "The",
  "This",
]);

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

export function stripPlaceholderTokens(value: string | null | undefined): string {
  if (!value) return value || "";
  return value
    .replace(PLACEHOLDER_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function randomToken(entityType: string): string {
  const bytes = new Uint8Array(5);
  window.crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `<${entityType}_${suffix}>`;
}

function findAllMatches(value: string, pattern: RegExp): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value)) !== null) {
    matches.push(match);
    // Prevent infinite loops for zero-length matches.
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  return matches;
}

function overlapsExistingToken(value: string, start: number, end: number): boolean {
  for (const match of findAllMatches(value, PII_TOKEN_PATTERN)) {
    const tokenStart = match.index || 0;
    const tokenEnd = tokenStart + match[0].length;
    if (tokenStart < end && start < tokenEnd) return true;
  }
  return false;
}

function collectMatches(value: string): Array<{ start: number; end: number; type: string }> {
  const spans: Array<{ start: number; end: number; type: string }> = [];
  const addMatches = (pattern: RegExp, type: string) => {
    for (const match of findAllMatches(value, pattern)) {
      const start = match.index || 0;
      const end = start + match[0].length;
      if (!overlapsExistingToken(value, start, end)) {
        spans.push({ start, end, type });
      }
    }
  };

  addMatches(EMAIL_PATTERN, "EMAIL");
  addMatches(PHONE_PATTERN, "PHONE");
  addMatches(SHORT_PHONE_PATTERN, "PHONE");

  for (const match of findAllMatches(value, PERSON_PATTERN)) {
    const start = match.index || 0;
    const end = start + match[0].length;
    const firstWord = match[0].split(/\s+/)[0];
    if (!PERSON_FALSE_STARTS.has(firstWord) && !overlapsExistingToken(value, start, end)) {
      spans.push({ start, end, type: "PERSON" });
    }
  }

  return spans
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
    .reduce<Array<{ start: number; end: number; type: string }>>((merged, span) => {
      const previous = merged[merged.length - 1];
      if (!previous || span.start >= previous.end) {
        merged.push(span);
      } else if (span.end - span.start > previous.end - previous.start) {
        merged[merged.length - 1] = span;
      }
      return merged;
    }, []);
}

export function tokenizePIILocally(
  value: string,
  existingMapping: Record<string, string> = {}
): { redacted: string; mapping: Record<string, string> } {
  if (!value) return { redacted: value, mapping: existingMapping };
  const spans = collectMatches(value);
  if (spans.length === 0) return { redacted: value, mapping: existingMapping };

  const mapping = { ...existingMapping };
  const valueToToken = new Map(Object.entries(mapping).map(([token, plain]) => [plain, token]));
  let cursor = 0;
  let redacted = "";

  for (const span of spans) {
    const plain = value.slice(span.start, span.end);
    let token = valueToToken.get(plain);
    if (!token) {
      token = randomToken(span.type);
      valueToToken.set(plain, token);
      mapping[token] = plain;
    }
    redacted += value.slice(cursor, span.start) + token;
    cursor = span.end;
  }
  redacted += value.slice(cursor);
  return { redacted, mapping };
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
