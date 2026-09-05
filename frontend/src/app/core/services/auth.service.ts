import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthResponse, LoginRequest, RegisterRequest } from '../models/auth.model';
import { User } from '../models/user.model';

const TOKEN_STORAGE_KEY = 'resumeAnalyser.auth.token';
const USER_STORAGE_KEY = 'resumeAnalyser.auth.user';

/**
 * Owns the app's authentication session: registering/logging in against the real backend
 * `auth` module, and holding the current JWT + user in memory (backed by `localStorage` so a
 * page refresh doesn't log the user out).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenSignal = signal<string | null>(this.readStoredToken());
  private readonly userSignal = signal<User | null>(this.readStoredUser());

  /** The signed-in user, or null when no one is signed in. */
  readonly currentUser = this.userSignal.asReadonly();

  /** Whether a user currently has a valid session. */
  readonly isAuthenticated = computed(() => this.userSignal() !== null);

  constructor(private readonly http: HttpClient) {}

  /**
   * Creates a new account via `POST /auth/register` and, on success, starts a session for it —
   * the backend returns the same {@link AuthResponse} shape as login, so a freshly registered
   * user is immediately signed in.
   */
  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${environment.apiBaseUrl}/auth/register`, request)
      .pipe(tap((response) => this.persistSession(response)));
  }

  /** Authenticates an existing account via `POST /auth/login` and starts a session for it. */
  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${environment.apiBaseUrl}/auth/login`, request)
      .pipe(tap((response) => this.persistSession(response)));
  }

  /** Ends the current session, both in memory and in `localStorage`. */
  logout(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
  }

  /** The current JWT to send as `Authorization: Bearer <token>`, or null if signed out. */
  getToken(): string | null {
    return this.tokenSignal();
  }

  private persistSession(response: AuthResponse): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
    this.tokenSignal.set(response.token);
    this.userSignal.set(response.user);
  }

  private readStoredToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  private readStoredUser(): User | null {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    // A previous version of this app could have stored a differently-shaped user (or the value
    // could be corrupted by a user editing localStorage directly) — treat any parse failure as
    // "no session" rather than crashing app bootstrap.
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }
}
