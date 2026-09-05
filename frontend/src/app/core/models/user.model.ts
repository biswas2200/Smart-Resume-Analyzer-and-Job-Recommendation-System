/**
 * RBAC role assigned to a user account.
 * Mirrors `com.resumeanalyser.account.UserRole` (docs/entities-and-fields.md §2.1) exactly —
 * the values are the literal strings the backend serializes, since the entity stores this
 * enum as `EnumType.STRING`.
 */
export type UserRole = 'USER' | 'PREMIUM_USER' | 'ADMIN';

/**
 * Public-facing view of an account, as returned by the backend.
 * Mirrors `com.resumeanalyser.account.dto.UserDto` field-for-field — deliberately excludes
 * any credential data, since the backend never sends the password hash to a client.
 */
export interface User {
  id: string;
  email: string;
  role: UserRole;

  /** ISO-8601 instant the account was created. */
  createdAt: string;
}
