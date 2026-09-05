import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { AuthService } from '../services/auth.service';

/**
 * Blocks navigation to any protected route unless the user has an active session,
 * redirecting to the login page otherwise.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isAuthenticated() ? true : router.parseUrl('/login');
};
