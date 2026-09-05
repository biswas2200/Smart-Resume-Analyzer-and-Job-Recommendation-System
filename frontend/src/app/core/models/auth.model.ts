import { User } from './user.model';

/** Request body for `POST /auth/login`. Mirrors `auth.dto.LoginRequest`. */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Request body for `POST /auth/register`. Mirrors `auth.dto.RegisterRequest`.
 * The backend enforces `@Email`, a 320-char max on email, and an 8-72 char password
 * (bcrypt silently truncates beyond 72 bytes) — the register form validates the same
 * constraints client-side so a user sees the problem before submitting.
 */
export interface RegisterRequest {
  email: string;
  password: string;
}

/**
 * Response body returned by both `POST /auth/register` and `POST /auth/login`.
 * Mirrors `auth.dto.AuthResponse` — a freshly issued JWT plus the account it belongs to.
 */
export interface AuthResponse {
  token: string;

  /** Always "Bearer" — sent by the backend so clients don't have to hardcode the auth scheme. */
  tokenType: string;

  /** ISO-8601 instant the token stops being valid. */
  expiresAt: string;

  user: User;
}
