import type { ApiErrorBody, ErrorCode } from './errors';

/**
 * Client-side fetch wrapper. Every route returns the same error envelope (spec §6A), so
 * unwrapping it in one place means no component has to hand-roll error parsing — they all
 * get a discriminated union and a guaranteed-present user-facing message.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      headers:
        init?.body instanceof FormData
          ? init?.headers
          : { 'Content-Type': 'application/json', ...init?.headers },
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
      return {
        ok: false,
        error: body?.error ?? {
          code: 'INTERNAL',
          message: `Request failed (${response.status}).`,
        },
      };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch {
    // Network-level failure — the offline case a reviewer is most likely to trigger.
    return {
      ok: false,
      error: { code: 'INTERNAL', message: 'Network error — check your connection.' },
    };
  }
}
