import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import { internal, validationFailed } from '@/lib/errors';

/**
 * Mocked auth (spec §5): no password. We confirm the email belongs to a seeded user and
 * issue a signed cookie. Documented as mocked in the README — it is not real auth and is
 * not pretending to be.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email) return validationFailed('Enter an email address.');

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return validationFailed('No user found with that email. Try one of the seeded accounts.');
    }

    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions());
    return response;
  } catch (err) {
    return internal('POST /api/auth/login', err);
  }
}
