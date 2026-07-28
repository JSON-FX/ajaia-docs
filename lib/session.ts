import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Mocked auth, on purpose (spec §5). There is no password: the login route checks that a
 * seeded user exists and issues a signed cookie. The signature is real — you cannot forge
 * a session by editing the cookie — but identity is asserted, not proven.
 */

export const SESSION_COOKIE = 'ajaia_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(value);
}

export type Session = { userId: string };

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

/** Returns the caller's session, or null if absent/expired/tampered-with. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    const userId = payload.userId;
    return typeof userId === 'string' && userId.length > 0 ? { userId } : null;
  } catch {
    // Expired or bad signature — treat as signed out rather than erroring.
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  };
}
