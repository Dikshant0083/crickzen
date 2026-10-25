import { createHash, randomBytes } from 'node:crypto';
import { type Algorithm, hash, verify } from '@node-rs/argon2';
import { jwtVerify, SignJWT } from 'jose';

/** OWASP argon2id parameters (ARCHITECTURE §5.3): 19 MiB, 2 iterations, 1 lane. */
// Algorithm is a const enum, unreadable under isolatedModules; 2 is Argon2id (tested).
const ARGON2 = { algorithm: 2 as Algorithm, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

let dummy: Promise<string> | null = null;

/**
 * Verifies against the stored hash, or against a throwaway one when the user
 * does not exist, so a wrong username and a wrong password take the same time.
 */
export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (stored === null) {
    dummy ??= hashPassword(randomBytes(16).toString('hex'));
    await verify(await dummy, password).catch(() => false);
    return false;
  }
  return verify(stored, password).catch(() => false);
}

export function signAccessToken(userId: string, secret: Uint8Array): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret);
}

/** The user id, or null for any invalid, expired or tampered token. */
export async function verifyAccessToken(token: string, secret: Uint8Array): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** 256 random bits for the client; only the SHA-256 ever reaches the database. */
export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
