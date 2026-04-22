import crypto from 'node:crypto';

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * RFC 7636 PKCE code_verifier / code_challenge 생성.
 * code_verifier: 43~128자 Base64URL 랜덤.
 * code_challenge: SHA-256(code_verifier) → Base64URL.
 */
export function generatePkce(): PkcePair {
  const codeVerifier = base64UrlEncode(crypto.randomBytes(48));
  const codeChallenge = base64UrlEncode(
    crypto.createHash('sha256').update(codeVerifier).digest(),
  );
  return { codeVerifier, codeChallenge };
}

/** CSRF 방지용 state 파라미터. */
export function generateState(): string {
  return base64UrlEncode(crypto.randomBytes(24));
}
