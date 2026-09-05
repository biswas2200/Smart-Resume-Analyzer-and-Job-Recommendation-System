import { HttpErrorResponse } from '@angular/common/http';

import { ApiError } from '../models/api-error.model';

const DEFAULT_FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Turns any error thrown by an HTTP call into a message safe to show a user.
 * Reads the backend's uniform {@link ApiError} body when present (see
 * `com.resumeanalyser.common.ApiError`), including any per-field validation details;
 * otherwise falls back to a generic message, since the error could be a network failure
 * with no server-generated body at all.
 */
export function extractApiErrorMessage(
  error: unknown,
  fallback = DEFAULT_FALLBACK_MESSAGE,
): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  const body = error.error as Partial<ApiError> | null;
  if (!body?.message) {
    return fallback;
  }

  if (body.fieldErrors?.length) {
    return `${body.message}: ${body.fieldErrors.join(', ')}`;
  }

  return body.message;
}
