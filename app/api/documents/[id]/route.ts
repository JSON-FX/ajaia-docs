import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { canEdit, resolveAccess } from '@/lib/access';
import { exceedsSizeLimit, sanitizeHtml } from '@/lib/sanitize';
import { forbidden, internal, notFound, unauthenticated, validationFailed } from '@/lib/errors';

type Context = { params: Promise<{ id: string }> };

/** GET /api/documents/:id → the document plus the caller's role. */
export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id } = await params;
    const role = await resolveAccess(id, session.userId);
    // Unknown id and no-access are indistinguishable to the caller, by design.
    if (!role) return notFound();

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        contentHtml: true,
        updatedAt: true,
        owner: { select: { name: true, email: true } },
      },
    });

    if (!document) return notFound();

    return NextResponse.json({ document, role });
  } catch (err) {
    return internal('GET /api/documents/:id', err);
  }
}

/** PATCH /api/documents/:id → update title and/or content. Requires OWNER or EDITOR. */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id } = await params;
    const role = await resolveAccess(id, session.userId);

    if (!role) return notFound();
    // A VIEWER knows the document exists, so 403 here leaks nothing and is the honest code.
    if (!canEdit(role)) return forbidden();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return validationFailed('Invalid request body.');

    const data: { title?: string; contentHtml?: string } = {};

    if (body.title !== undefined) {
      if (typeof body.title !== 'string') return validationFailed('Title must be text.');
      // Empty title coerces rather than erroring (spec §6A) — a blank title box during
      // editing should never be a hard failure.
      const trimmed = body.title.trim().slice(0, 200);
      data.title = trimmed.length > 0 ? trimmed : 'Untitled document';
    }

    if (body.contentHtml !== undefined) {
      if (typeof body.contentHtml !== 'string') return validationFailed('Content must be text.');
      if (exceedsSizeLimit(body.contentHtml)) {
        return validationFailed('This document is too large to save (1 MB limit).');
      }
      // Sanitised on EVERY write, not just on upload. The editor is not the only way to
      // reach this route.
      data.contentHtml = sanitizeHtml(body.contentHtml);
    }

    if (Object.keys(data).length === 0) {
      return validationFailed('Nothing to update.');
    }

    const updated = await prisma.document.update({
      where: { id },
      data,
      select: { id: true, title: true, updatedAt: true },
    });

    return NextResponse.json({ document: updated });
  } catch (err) {
    return internal('PATCH /api/documents/:id', err);
  }
}
