import { HttpErrorResponse } from '@angular/common/http';

import { extractApiErrorMessage } from './api-error.util';

describe('extractApiErrorMessage', () => {
  it('returns the backend message when present', () => {
    const error = new HttpErrorResponse({
      status: 401,
      error: {
        timestamp: '2026-01-01T00:00:00Z',
        status: 401,
        message: 'Invalid credentials',
        fieldErrors: null,
      },
    });

    expect(extractApiErrorMessage(error)).toBe('Invalid credentials');
  });

  it('appends field errors to the message when present', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: {
        timestamp: '2026-01-01T00:00:00Z',
        status: 400,
        message: 'Validation failed',
        fieldErrors: [
          'email: must be a well-formed email address',
          'password: size must be between 8 and 72',
        ],
      },
    });

    expect(extractApiErrorMessage(error)).toBe(
      'Validation failed: email: must be a well-formed email address, password: size must be between 8 and 72',
    );
  });

  it('falls back to a generic message when the error body is not an ApiError', () => {
    const error = new HttpErrorResponse({ status: 0 });

    expect(extractApiErrorMessage(error)).toBe('Something went wrong. Please try again.');
  });

  it('uses a caller-supplied fallback message when provided', () => {
    const error = new HttpErrorResponse({ status: 0 });

    expect(extractApiErrorMessage(error, 'Could not reach the server.')).toBe(
      'Could not reach the server.',
    );
  });

  it('falls back for a non-HttpErrorResponse value', () => {
    expect(extractApiErrorMessage(new Error('boom'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
