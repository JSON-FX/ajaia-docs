import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { canEdit, canManage, resolveAccess, type AccessDb } from '@/lib/access';

/**
 * The meaningful test (spec §9).
 *
 * Cases 1–6 exercise the chokepoint directly by injecting a fake Prisma client — fast,
 * deterministic, no database required to run `npm test`.
 *
 * Case 7 is the one that matters most: it drives the real PATCH route handler, through
 * the real resolveAccess, and asserts a VIEWER is rejected with 403 at the HTTP boundary.
 * A unit test of resolveAccess alone would still pass if a handler simply forgot to call
 * it — this is the test that catches that.
 */

// Shared in-memory store. vi.hoisted so the vi.mock factories below (which are hoisted
// above the imports) and the test bodies reference the same object.
const h = vi.hoisted(() => {
  type Doc = { id: string; title: string; contentHtml: string; ownerId: string };
  type Share = { documentId: string; userId: string; role: 'VIEWER' | 'EDITOR' };

  const documents = new Map<string, Doc>();
  const shares = new Map<string, Share>();
  let sessionUserId: string | null = null;

  const shareKey = (documentId: string, userId: string) => `${documentId}:${userId}`;

  const db = {
    document: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        documents.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<Doc> }) => {
        const existing = documents.get(where.id);
        if (!existing) throw new Error('not found');
        const updated = { ...existing, ...data };
        documents.set(where.id, updated);
        return { id: updated.id, title: updated.title, updatedAt: new Date() };
      },
    },
    documentShare: {
      findUnique: async ({
        where,
      }: {
        where: { documentId_userId: { documentId: string; userId: string } };
      }) => shares.get(shareKey(where.documentId_userId.documentId, where.documentId_userId.userId)) ?? null,
    },
  };

  return {
    db,
    documents,
    shares,
    shareKey,
    setSession: (userId: string | null) => {
      sessionUserId = userId;
    },
    readSession: () => sessionUserId,
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: h.db }));
vi.mock('@/lib/session', () => ({
  getSession: async () => {
    const userId = h.readSession();
    return userId ? { userId } : null;
  },
}));

// Imported after the mocks above are registered.
const { PATCH } = await import('@/app/api/documents/[id]/route');

const ALICE = 'user-alice';
const BOB = 'user-bob';
const CAROL = 'user-carol';
const DOC = 'doc-1';

function patchRequest(body: unknown) {
  return new Request(`http://localhost/api/documents/${DOC}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  h.documents.clear();
  h.shares.clear();
  h.setSession(null);

  // Alice owns the document in every scenario below.
  h.documents.set(DOC, {
    id: DOC,
    title: 'Vendor contract review',
    contentHtml: '<p>Original content</p>',
    ownerId: ALICE,
  });
});

describe('resolveAccess', () => {
  const db = h.db as unknown as AccessDb;

  it('returns OWNER for the document owner', async () => {
    expect(await resolveAccess(DOC, ALICE, db)).toBe('OWNER');
  });

  it('returns EDITOR for a user with an EDITOR share', async () => {
    h.shares.set(h.shareKey(DOC, BOB), { documentId: DOC, userId: BOB, role: 'EDITOR' });
    expect(await resolveAccess(DOC, BOB, db)).toBe('EDITOR');
  });

  it('returns VIEWER for a user with a VIEWER share', async () => {
    h.shares.set(h.shareKey(DOC, BOB), { documentId: DOC, userId: BOB, role: 'VIEWER' });
    expect(await resolveAccess(DOC, BOB, db)).toBe('VIEWER');
  });

  it('returns null for an unrelated user', async () => {
    expect(await resolveAccess(DOC, CAROL, db)).toBeNull();
  });

  it('returns null for a document that does not exist', async () => {
    expect(await resolveAccess('no-such-doc', ALICE, db)).toBeNull();
  });

  it('returns OWNER even when a stale VIEWER share row also exists for the owner', async () => {
    // The failure mode this guards: a share row that outlives an ownership change would
    // otherwise silently demote the owner to read-only on their own document.
    h.shares.set(h.shareKey(DOC, ALICE), { documentId: DOC, userId: ALICE, role: 'VIEWER' });
    expect(await resolveAccess(DOC, ALICE, db)).toBe('OWNER');
  });
});

describe('canEdit / canManage', () => {
  it('lets OWNER and EDITOR edit, but not VIEWER or a non-member', () => {
    expect(canEdit('OWNER')).toBe(true);
    expect(canEdit('EDITOR')).toBe(true);
    expect(canEdit('VIEWER')).toBe(false);
    expect(canEdit(null)).toBe(false);
  });

  it('lets only OWNER manage shares', () => {
    expect(canManage('OWNER')).toBe(true);
    expect(canManage('EDITOR')).toBe(false);
    expect(canManage('VIEWER')).toBe(false);
    expect(canManage(null)).toBe(false);
  });
});

describe('PATCH /api/documents/:id — enforcement at the HTTP boundary', () => {
  it('rejects a VIEWER with 403 and leaves the content unchanged', async () => {
    h.shares.set(h.shareKey(DOC, BOB), { documentId: DOC, userId: BOB, role: 'VIEWER' });
    h.setSession(BOB);

    const response = await PATCH(patchRequest({ contentHtml: '<p>Viewer was here</p>' }), {
      params: Promise.resolve({ id: DOC }),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN');
    // Hiding the toolbar is not the control — the server is.
    expect(h.documents.get(DOC)?.contentHtml).toBe('<p>Original content</p>');
  });

  it('returns 404 (not 403) for a non-member, so document existence is not leaked', async () => {
    h.setSession(CAROL);

    const response = await PATCH(patchRequest({ contentHtml: '<p>nope</p>' }), {
      params: Promise.resolve({ id: DOC }),
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('returns 401 when there is no session', async () => {
    const response = await PATCH(patchRequest({ contentHtml: '<p>nope</p>' }), {
      params: Promise.resolve({ id: DOC }),
    });

    expect(response.status).toBe(401);
  });

  it('allows an EDITOR to save, and sanitises what they send', async () => {
    h.shares.set(h.shareKey(DOC, BOB), { documentId: DOC, userId: BOB, role: 'EDITOR' });
    h.setSession(BOB);

    const response = await PATCH(
      patchRequest({ contentHtml: '<p>Legit</p><script>alert(1)</script>' }),
      { params: Promise.resolve({ id: DOC }) }
    );

    expect(response.status).toBe(200);
    const stored = h.documents.get(DOC)?.contentHtml ?? '';
    expect(stored).toContain('<p>Legit</p>');
    expect(stored).not.toContain('script');
  });

  it('coerces an empty title rather than failing the save', async () => {
    h.setSession(ALICE);

    const response = await PATCH(patchRequest({ title: '   ' }), {
      params: Promise.resolve({ id: DOC }),
    });

    expect(response.status).toBe(200);
    expect(h.documents.get(DOC)?.title).toBe('Untitled document');
  });
});
