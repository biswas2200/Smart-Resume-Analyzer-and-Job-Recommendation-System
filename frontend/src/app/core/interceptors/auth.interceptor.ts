import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthService } from '../services/auth.service';

// The login/register endpoints must never carry a (possibly stale) Bearer token — the backend
// treats them as unauthenticated on purpose (see AuthController), and an unrelated 401 from a
// leftover token would be confusing to debug.
const UNAUTHENTICATED_PATHS = ['/auth/login', '/auth/register'];

/**
 * Attaches the current session's JWT (if any) as `Authorization: Bearer <token>` to every
 * outgoing request, so individual services/components never have to think about auth headers.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();
  const isUnauthenticatedEndpoint = UNAUTHENTICATED_PATHS.some((path) =>
    request.url.includes(path),
  );

  if (!token || isUnauthenticatedEndpoint) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};
