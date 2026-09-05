import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpInterceptorFn,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor as HttpInterceptorFn])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches a Bearer token to requests when a session exists', () => {
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
    // Re-inject so AuthService picks up the localStorage values set above.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor as HttpInterceptorFn])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);

    http.get('/api/resumes').subscribe();

    const req = httpMock.expectOne('/api/resumes');
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-jwt-token');
  });

  it('does not attach a header when there is no session', () => {
    http.get('/api/resumes').subscribe();

    const req = httpMock.expectOne('/api/resumes');
    expect(req.request.headers.has('Authorization')).toBe(false);
  });

  it('does not attach a header to the login/register requests themselves', () => {
    localStorage.setItem('resumeAnalyser.auth.token', 'stale-token-from-a-previous-session');

    http.post('http://localhost:8080/auth/login', {}).subscribe();

    const req = httpMock.expectOne('http://localhost:8080/auth/login');
    expect(req.request.headers.has('Authorization')).toBe(false);
  });
});
