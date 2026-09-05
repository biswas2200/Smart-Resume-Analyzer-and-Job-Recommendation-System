import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import { AuthResponse } from '../models/auth.model';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  const fakeAuthResponse: AuthResponse = {
    token: 'fake-jwt-token',
    tokenType: 'Bearer',
    expiresAt: '2099-01-01T00:00:00Z',
    user: {
      id: 'user-1',
      email: 'jane@example.com',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00Z',
    },
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts with no authenticated user when localStorage is empty', () => {
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.getToken()).toBeNull();
  });

  it('registers a new account and stores the session', () => {
    let result: AuthResponse | undefined;

    service
      .register({ email: 'jane@example.com', password: 'password123' })
      .subscribe((response) => {
        result = response;
      });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'jane@example.com', password: 'password123' });
    req.flush(fakeAuthResponse);

    expect(result).toEqual(fakeAuthResponse);
    expect(service.currentUser()).toEqual(fakeAuthResponse.user);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.getToken()).toBe('fake-jwt-token');
  });

  it('logs into an existing account and stores the session', () => {
    service.login({ email: 'jane@example.com', password: 'password123' }).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    req.flush(fakeAuthResponse);

    expect(service.currentUser()).toEqual(fakeAuthResponse.user);
    expect(service.getToken()).toBe('fake-jwt-token');
  });

  it('propagates login errors without storing a session', () => {
    let failed = false;

    service.login({ email: 'jane@example.com', password: 'wrong' }).subscribe({
      error: () => (failed = true),
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
    req.flush(
      {
        timestamp: '2026-01-01T00:00:00Z',
        status: 401,
        message: 'Invalid credentials',
        fieldErrors: null,
      },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(failed).toBe(true);
    expect(service.currentUser()).toBeNull();
    expect(service.getToken()).toBeNull();
  });

  it('rehydrates the session from localStorage on construction', () => {
    localStorage.setItem('resumeAnalyser.auth.token', fakeAuthResponse.token);
    localStorage.setItem('resumeAnalyser.auth.user', JSON.stringify(fakeAuthResponse.user));

    // A fresh injector picks up a fresh AuthService instance, re-reading localStorage.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const rehydrated = TestBed.inject(AuthService);

    expect(rehydrated.isAuthenticated()).toBe(true);
    expect(rehydrated.currentUser()).toEqual(fakeAuthResponse.user);
    expect(rehydrated.getToken()).toBe(fakeAuthResponse.token);
  });

  it('clears the session on logout', () => {
    service.login({ email: 'jane@example.com', password: 'password123' }).subscribe();
    httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`).flush(fakeAuthResponse);

    service.logout();

    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.getToken()).toBeNull();
    expect(localStorage.getItem('resumeAnalyser.auth.token')).toBeNull();
  });
});
