import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let router: Router;

  function runGuard(): boolean | UrlTree {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/dashboard' } as never),
    ) as boolean | UrlTree;
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    router = TestBed.inject(Router);
  });

  afterEach(() => localStorage.clear());

  it('allows navigation when a session exists', () => {
    localStorage.setItem('resumeAnalyser.auth.token', 'fake-jwt-token');
    localStorage.setItem(
      'resumeAnalyser.auth.user',
      JSON.stringify({
        id: 'u1',
        email: 'jane@example.com',
        role: 'USER',
        createdAt: '2026-01-01T00:00:00Z',
      }),
    );

    expect(runGuard()).toBe(true);
  });

  it('redirects to /login when there is no session', () => {
    const result = runGuard();

    expect(result).not.toBe(true);
    expect((result as UrlTree).toString()).toBe(router.parseUrl('/login').toString());
  });

  it('injects AuthService from the current context (sanity check)', () => {
    expect(() => TestBed.inject(AuthService)).not.toThrow();
  });
});
