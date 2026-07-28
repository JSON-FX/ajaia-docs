import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { isEffectivelyEmpty, exceedsSizeLimit, sanitizeHtml } from '@/lib/sanitize';
import {
  getExtension,
  isAllowedExtension,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  ParseError,
  parseUpload,
  titleFromFilename,
} from '@/lib/parsers';
import { internal, unauthenticated, validationFailed } from '@/lib/errors';

/**
 * POST /api/upload — parse and discard (spec §6).
 *
 * The uploaded bytes are parsed to HTML in memory and then dropped on the floor. Nothing
 * is written to disk or object storage. The product need is "turn this file into an
 * editable document", not "retain the file", so storing the original would buy us an
 * infrastructure dependency (blob store, signed URLs, serverless ephemeral-fs problems)
 * for no user-visible benefit.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');

    if (!file || typeof file === 'string') {
      return validationFailed('Choose a file to upload.');
    }

    const extension = getExtension(file.name);
    if (!isAllowedExtension(extension)) {
      return validationFailed('Only .txt, .md, and .docx files are supported.');
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return validationFailed(`That file is larger than the ${MAX_UPLOAD_LABEL} limit.`);
    }

    if (file.size === 0) {
      return validationFailed('That file is empty.');
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // MIME is checked loosely and never trusted on its own — extension plus a successful
    // parse is the real gate. A .txt renamed to .docx fails here, at parse time.
    let rawHtml: string;
    try {
      rawHtml = await parseUpload(extension, buffer);
    } catch (err) {
      if (err instanceof ParseError) return validationFailed(err.message);
      throw err;
    }

    const contentHtml = sanitizeHtml(rawHtml);

    if (isEffectivelyEmpty(contentHtml)) {
      return validationFailed('That file did not contain any readable text.');
    }

    if (exceedsSizeLimit(contentHtml)) {
      return validationFailed('That document is too large to store (1 MB of text).');
    }

    const document = await prisma.document.create({
      data: {
        title: titleFromFilename(file.name).slice(0, 200),
        contentHtml,
        ownerId: session.userId,
      },
      select: { id: true },
    });

    return NextResponse.json({ id: document.id }, { status: 201 });
  } catch (err) {
    return internal('POST /api/upload', err);
  }
}
