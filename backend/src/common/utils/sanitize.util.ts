/**
 * Text sanitisation shared by chat, reports and any other user-generated free
 * text. The mobile app renders message bodies as Flutter `Text` widgets (no
 * HTML engine), so stored XSS is not directly executable there; however the
 * API is also consumed by web/tooling and bodies are persisted, so we strip
 * control characters and neutralise HTML/script markup defensively at the
 * boundary. This is output-safe by construction: nothing here can emit live
 * markup.
 */

const ZERO_WIDTH = /[​‌‍﻿﻿]/g;
// C0/C1 control characters except the common whitespace ones we keep.
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;

/**
 * Normalises and sanitises user free text:
 *  - removes zero-width / control characters
 *  - collapses runs of whitespace (but preserves single newlines)
 *  - escapes HTML-significant characters so stored content can never be
 *    interpreted as markup by an HTML consumer
 *  - enforces a hard length ceiling.
 */
export function sanitizeText(input: string, maxLength = 2000): string {
  if (typeof input !== 'string') return '';
  let text = input;
  text = text.normalize('NFKC');
  text = text.replace(ZERO_WIDTH, '');
  text = text.replace(CONTROL_CHARS, '');
  // Neutralise HTML/script injection. Order matters: ampersands first.
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  // Collapse spaces/tabs; keep at most two consecutive newlines.
  text = text.replace(/[ \t\f\v]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();
  if (text.length > maxLength) {
    text = text.slice(0, maxLength);
  }
  return text;
}

/** Lightweight check used before persisting display names / single-line fields. */
export function sanitizeSingleLine(input: string, maxLength = 64): string {
  return sanitizeText(input, maxLength).replace(/\s*\n\s*/g, ' ').trim();
}

/**
 * Returns true when the string looks like an injection attempt aimed at an
 * SQL/NoSQL shell. Used only for extra logging/flagging — all real queries go
 * through TypeORM parameter binding, which is itself injection-proof.
 */
export function looksLikeSqlInjection(input: string): boolean {
  if (!input) return false;
  const patterns = [
    /(\b(union\s+select|select\s+.*\s+from|insert\s+into|delete\s+from|drop\s+table|update\s+.*\s+set)\b)/i,
    /(--|;|\/\*|\*\/)/,
    /\b(or|and)\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i,
  ];
  return patterns.some((re) => re.test(input));
}
