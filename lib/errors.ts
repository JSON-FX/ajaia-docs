import { NextResponse } from 'next/server';

/**
 * Single error contract for every route handler (spec §6A).
 * The client renders `error.message` directly, so messages must be user-facing —
 * never a stack trace, never a raw driver error.
 */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  INTERNAL: 500,
};

export type ApiErrorBody = { error: { code: ErrorCode; message: string } };

export function apiError(code: ErrorCode, message: string) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message } }, { status: STATUS[code] });
}

/** Shorthands for the cases used across many routes, so wording stays consistent. */
export const unauthenticated = () => apiError('UNAUTHENTICATED', 'You are not signed in.');

/**
 * Used for both "document does not exist" and "you have no access to it".
 * Deliberately identical — a distinct 403 would leak the existence of documents
 * to non-members (spec §4).
 */
export const notFound = () => apiError('NOT_FOUND', 'Document not found.');

export const forbidden = (message = 'You have view-only access to this document.') =>
  apiError('FORBIDDEN', message);

export const validationFailed = (message: string) => apiError('VALIDATION_FAILED', message);

/** Logs server-side, returns an opaque message. */
export function internal(context: string, err: unknown) {
  console.error(`[${context}]`, err);
  return apiError('INTERNAL', 'Something went wrong. Please try again.');
}
